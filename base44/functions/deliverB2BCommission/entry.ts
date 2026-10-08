import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { signRequest, isNonRetryableError, backoffDelayMs } from '../../shared/payrollCrypto.ts';
import { getPayrollConfig } from '../../shared/payrollSettings.ts';

// ============================================================================
// DELIVER B2B COMMISSION — Arriv Pay Compensation Handoff
//
// Delivers eligible B2BCommissionEvent records to Arriv Pay's compensation
// endpoint. Reuses the same HMAC authentication, idempotency, acknowledgement,
// retry, and audit mechanisms as the retail Commission handoff
// (sendApprovedCompensationToPayroll) and the PrepaidCompensationEvent
// handoff (deliverPrepaidCompensation).
//
// Delivery states (B2BCommissionEvent.payroll_status):
//   pending      → not yet sent, or retryable failure
//   sent_to_payroll → request sent, awaiting acknowledgement
//   paid         → acknowledged by Arriv Pay (immutable — never re-deliver)
//   failed       → terminal non-retryable failure
//   not_applicable → manually excluded or ineligible (rep inactive, $0, etc.)
//
// Eligibility gates (checked at delivery time):
//   1. payroll_status must be 'pending' (not paid/failed/not_applicable)
//   2. Rep must be active (is_active=true, employment_status='active')
//   3. Amount must be non-zero (positive for normal, negative for adjustments)
//   4. Event must have an eligible_at date (created from collected revenue)
//
// Idempotency: Arriv Pay deduplicates by source_system + source_event_id.
// The event_id is the canonical source_event_id; idempotency_key is preserved.
//
// Certification mode: When certification_mode=true, eligibility is validated
// but NO HTTP call is made. Events remain at 'pending'. This allows the
// certification test suite to verify delivery logic without real payroll payout.
// ============================================================================

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { action, event_id, max_batch, certification_mode } = body;
    const certMode = certification_mode === true;

    const b = base44.asServiceRole;

    // ── Validate eligibility for a single event (no HTTP call) ──────────────
    if (action === 'validate_eligibility' && event_id) {
      const event = await fetchEvent(b, event_id);
      if (!event) return Response.json({ error: 'Event not found' }, { status: 404 });
      const eligibility = await checkEligibility(b, event);
      return Response.json({ status: 'OK', event_id, ...eligibility });
    }

    // ── Deliver a single event by ID ────────────────────────────────────────
    if (action === 'deliver_one' && event_id) {
      const result = await deliverOneEvent(b, event_id, certMode);
      return Response.json(result, { status: result.error ? 500 : 200 });
    }

    // ── Deliver all pending events in batch ──────────────────────────────────
    const batchSize = Math.min(max_batch || 50, 100);

    // Fetch pending events. In certification mode, only cert_-prefixed events.
    const allPending = await b.entities.B2BCommissionEvent.filter(
      { payroll_status: 'pending' },
      '-created_at',
      batchSize
    );
    let pendingEvents = Array.isArray(allPending) ? allPending : (allPending?.data || []);

    // In certification mode, filter to cert_-prefixed synthetic events only
    if (certMode) {
      pendingEvents = pendingEvents.filter(e =>
        (e.event_id || '').startsWith('cert_') || (e.idempotency_key || '').startsWith('cert_')
      );
    }

    const results = [];
    let delivered = 0;
    let acknowledged = 0;
    let failed = 0;
    let skipped = 0;

    for (const event of pendingEvents) {
      const result = await deliverOneEvent(b, event.id, certMode, event);
      results.push({ event_id: event.id, canonical_event_id: event.event_id, ...result });
      if (result.status === 'ACKNOWLEDGED') acknowledged++;
      else if (result.status === 'DELIVERED') delivered++;
      else if (result.status === 'FAILED') failed++;
      else if (result.status === 'SKIPPED') skipped++;
    }

    return Response.json({
      status: 'batch_complete',
      certification_mode: certMode,
      processed: results.length,
      acknowledged,
      delivered,
      failed,
      skipped,
      results,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ── Fetch a single event ─────────────────────────────────────────────────────
async function fetchEvent(base44, eventId) {
  try {
    return await base44.entities.B2BCommissionEvent.get(eventId);
  } catch {
    return null;
  }
}

// ── Eligibility check (no HTTP call, no mutation) ────────────────────────────
async function checkEligibility(base44, event) {
  // 1. payroll_status must be pending
  if (event.payroll_status !== 'pending') {
    return {
      eligible: false,
      reason: `PAYROLL_STATUS_NOT_PENDING (${event.payroll_status})`,
      immutable: event.payroll_status === 'paid',
    };
  }

  // 2. Amount must be non-zero
  if (!event.amount || event.amount === 0) {
    return { eligible: false, reason: 'ZERO_AMOUNT' };
  }

  // 3. Must have eligible_at (created from collected revenue)
  if (!event.eligible_at) {
    return { eligible: false, reason: 'NOT_ELIGIBLE_NO_COLLECTED_REVENUE' };
  }

  // 4. Rep must be active at delivery time
  const rep = await base44.entities.SalesTeamMember.get(event.sales_rep_id).catch(() => null);
  if (!rep) {
    return { eligible: false, reason: 'REP_NOT_FOUND' };
  }
  const repActive = rep.is_active === true &&
    (rep.employment_status === 'active' || rep.employment_status === 'offer_accepted');
  if (!repActive) {
    return { eligible: false, reason: 'REP_INACTIVE_STOP_PAY', rep_status: rep.employment_status };
  }

  // 5. Pending-resolution employee (payroll not yet mapped) — safe skip
  if (!rep.payroll_employee_id && !rep.arriv_employee_id) {
    return { eligible: false, reason: 'REP_PAYROLL_NOT_MAPPED', rep_status: rep.employment_status };
  }

  return {
    eligible: true,
    reason: 'ELIGIBLE',
    rep_active: true,
    rep_name: rep.full_name,
    payroll_employee_id: rep.payroll_employee_id || rep.arriv_employee_id || '',
  };
}

// ── Deliver a single event to Arriv Pay ──────────────────────────────────────
async function deliverOneEvent(base44, eventId, certMode, existingEvent = null) {
  let event = existingEvent;
  if (!event) {
    event = await fetchEvent(base44, eventId);
  }
  if (!event) return { error: 'Event not found', status: 'FAILED' };

  // Immutable: never re-deliver a paid event
  if (event.payroll_status === 'paid') {
    return { status: 'SKIPPED', reason: 'ALREADY_PAID_IMMUTABLE', payroll_event_id: event.payroll_event_id };
  }
  // Terminal: don't retry failed non-retryable events
  if (event.payroll_status === 'failed') {
    return { status: 'SKIPPED', reason: 'TERMINAL_FAILURE' };
  }
  if (event.payroll_status === 'not_applicable') {
    return { status: 'SKIPPED', reason: 'NOT_APPLICABLE' };
  }
  if (event.payroll_status === 'sent_to_payroll') {
    // Already sent — treat as in-flight; don't duplicate
    return { status: 'SKIPPED', reason: 'ALREADY_SENT_AWAITING_ACK' };
  }

  // Eligibility check
  const eligibility = await checkEligibility(base44, event);
  if (!eligibility.eligible) {
    // Mark not_applicable for permanent ineligibility (rep inactive, zero amount)
    // Keep at pending for temporary ineligibility (rep payroll not mapped)
    const permanent = ['ZERO_AMOUNT', 'NOT_ELIGIBLE_NO_COLLECTED_REVENUE', 'REP_NOT_FOUND', 'REP_INACTIVE_STOP_PAY'];
    if (permanent.includes(eligibility.reason)) {
      await base44.entities.B2BCommissionEvent.update(eventId, {
        payroll_status: 'not_applicable',
      });
      await logAudit(base44, 'B2B_COMMISSION_DELIVERY_SKIPPED', eventId, eligibility.reason, event);
    }
    return { status: 'SKIPPED', reason: eligibility.reason };
  }

  // Certification mode: validate only, no HTTP call, no mutation
  if (certMode) {
    return {
      status: 'CERTIFIED_ELIGIBLE',
      event_id: event.event_id,
      idempotency_key: event.idempotency_key,
      amount: event.amount,
      rep: eligibility.rep_name,
      payroll_employee_id: eligibility.payroll_employee_id,
    };
  }

  // ── Build the Arriv Pay compensation payload ─────────────────────────────
  const isAdjustment = event.event_type === 'B2B_COMMISSION_ADJUSTMENT';
  const payload = {
    source_system: 'ARRIV_ESTATE_MEDIA',
    source_event_id: event.event_id,
    source_type: event.event_type,
    employee_id: event.sales_rep_id,
    employee_email: event.sales_rep_email || '',
    customer_id: event.organization_id || '',
    transaction_id: event.contract_id || event.tranche_id || '',
    gross_customer_cash: event.commission_basis || 0,
    commission_amount: event.amount,
    currency: 'USD',
    earned_at: event.eligible_at || event.created_at,
    effective_at: event.eligible_at || event.created_at,
    prepaid_tier: '',
    idempotency_key: event.idempotency_key || event.event_id,
    reverses_source_event_id: isAdjustment ? (event.source_record_id || '') : '',
    reversal_amount: isAdjustment ? Math.abs(event.amount || 0) : 0,
    reason: event.event_type,
  };

  const bodyStr = JSON.stringify(payload);
  const timestamp = Date.now().toString();
  const requestId = 'req_' + crypto.randomUUID();
  const sourceAppId = 'arriv_estate_media';

  // Sign with canonical 4-field format (same as deliverPrepaidCompensation)
  const config = await getPayrollConfig(base44);
  if (!config.apiSecret) {
    return { error: 'ARRIV_PAYROLL_API_SECRET not configured', status: 'FAILED' };
  }
  if (!config.endpoint) {
    return { error: 'ARRIV_PAYROLL_API_ENDPOINT not configured', status: 'FAILED' };
  }

  const signature = await signRequest(config.apiSecret, {
    body: bodyStr,
    timestamp,
    requestId,
    sourceAppId,
  });

  // Construct the Arriv Pay compensation endpoint URL
  const base = config.endpoint.replace(/\/functions\/.*$/i, '').replace(/\/$/, '');
  const url = base + '/functions/receiveEstateMediaCompensation';

  // Mark as sent_to_payroll (request about to be sent)
  const nowIso = new Date().toISOString();
  await base44.entities.B2BCommissionEvent.update(eventId, {
    payroll_status: 'sent_to_payroll',
    payroll_sent_at: nowIso,
  });

  let resp;
  let respData;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Arriv-Signature': signature,
        'X-Arriv-Timestamp': timestamp,
        'X-Arriv-Request-Id': requestId,
        'X-Arriv-Source-App': sourceAppId,
      },
      body: bodyStr,
    });
    respData = await resp.json().catch(() => ({}));
  } catch (err) {
    // Transport failure → back to pending for retry (exponential backoff)
    await base44.entities.B2BCommissionEvent.update(eventId, {
      payroll_status: 'pending',
    });
    await logAudit(base44, 'B2B_COMMISSION_DELIVERY_RETRY', eventId, `Transport failure: ${err.message}`, event);
    return {
      status: 'RETRYING',
      error: err.message,
      next_retry_delay_ms: backoffDelayMs(1),
    };
  }

  // Arriv Pay acknowledged successfully → mark paid (immutable)
  if (resp.ok && respData && (respData.acknowledged || respData.status === 'acknowledged' || respData.success)) {
    const payrollEventId = respData.compensation_import_id || respData.payroll_event_id || respData.event_id || '';
    await base44.entities.B2BCommissionEvent.update(eventId, {
      payroll_status: 'paid',
      payroll_event_id: payrollEventId,
      payroll_sent_at: respData.acknowledged_at || nowIso,
    });
    await logAudit(base44, 'B2B_COMMISSION_DELIVERED', eventId, `Acknowledged: ${payrollEventId}`, event);
    return {
      status: 'ACKNOWLEDGED',
      source_event_id: event.event_id,
      payroll_event_id: payrollEventId,
      acknowledged_at: respData.acknowledged_at || nowIso,
    };
  }

  // Non-retryable error → failed; retryable → back to pending
  const errMsg = (respData && (respData.error || respData.message)) ||
    `Arriv Pay rejected with status ${resp.status}`;

  const nonRetryable = isNonRetryableError(respData?.code, errMsg) ||
    resp.status === 400 || resp.status === 401 || resp.status === 403;

  if (nonRetryable) {
    await base44.entities.B2BCommissionEvent.update(eventId, {
      payroll_status: 'failed',
    });
    await logAudit(base44, 'B2B_COMMISSION_DELIVERY_FAILED', eventId, errMsg, event);
    return { status: 'FAILED', error: errMsg, http_status: resp.status, payroll_response: respData };
  }

  // Retryable: back to pending
  await base44.entities.B2BCommissionEvent.update(eventId, {
    payroll_status: 'pending',
  });
  await logAudit(base44, 'B2B_COMMISSION_DELIVERY_RETRY', eventId, errMsg, event);
  return { status: 'RETRYING', error: errMsg, http_status: resp.status };
}

// ── Audit log helper ─────────────────────────────────────────────────────────
async function logAudit(base44, action, entityId, reason, event) {
  try {
    await base44.entities.B2BAuditLog.create({
      actor: 'system',
      actor_type: 'system',
      action,
      reason,
      entity_type: 'B2BCommissionEvent',
      entity_id: entityId,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('Audit log failed:', e.message);
  }
}