import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { signRequest, isNonRetryableError, backoffDelayMs } from '../../shared/payrollCrypto.ts';
import { PREPAID_FEATURE_FLAG_KEY } from '../../shared/prepaidEngine.ts';

/**
 * Prepaid Compensation Delivery Pipeline
 *
 * Delivers approved PrepaidCompensationEvents to Arriv Pay's compensation
 * endpoint. Estate Media owns commission calculation; Arriv Pay owns payroll.
 *
 * Outbound auth: ARRIV_PAYROLL_API_SECRET using canonical 4-field signing
 * (body\ntimestamp\nrequestId\nsourceAppId) — matches Arriv Pay's receiver.
 *
 * Delivery states:
 *   PENDING → DELIVERED (request sent) → ACKNOWLEDGED (Pay confirms)
 *   temporary transport failure → RETRYING
 *   terminal/validation issue → FAILED or REVIEW_REQUIRED
 *
 * Idempotency: Arriv Pay deduplicates by sourceSystem + sourceEventId.
 * Estate Media safely handles duplicate acknowledgments without creating
 * new local events.
 *
 * This function is admin-gated and processes events in batches.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    // Feature flag check
    const flagRecords = await base44.asServiceRole.entities.AppSetting.filter(
      { key: PREPAID_FEATURE_FLAG_KEY },
      undefined,
      1
    );
    const flagArr = Array.isArray(flagRecords) ? flagRecords : (flagRecords?.data || []);
    const globalEnabled = flagArr.length > 0 ? flagArr[0].value === 'true' : false;
    if (!globalEnabled) {
      return Response.json({ error: 'Prepaid feature is not enabled' }, { status: 503 });
    }

    const body = await req.json().catch(() => ({}));
    const { action, event_id, max_batch } = body;

    // ── Deliver a single event by ID ────────────────────────────────────────
    if (action === 'deliver_one' && event_id) {
      const result = await deliverOneEvent(base44.asServiceRole, event_id);
      return Response.json(result, { status: result.error ? 500 : 200 });
    }

    // ── Deliver all PENDING/RETRYING events in batch ────────────────────────
    const batchSize = Math.min(max_batch || 50, 100);

    // Fetch PENDING and RETRYING events
    const pendingResp = await base44.asServiceRole.entities.PrepaidCompensationEvent.filter(
      { delivery_status: { $in: ['PENDING', 'RETRYING'] }, status: 'APPROVED' },
      '-earned_at',
      batchSize
    );
    const pendingEvents = Array.isArray(pendingResp) ? pendingResp : (pendingResp?.data || []);

    const results = [];
    let delivered = 0;
    let acknowledged = 0;
    let failed = 0;
    let reviewRequired = 0;

    for (const event of pendingEvents) {
      const result = await deliverOneEvent(base44.asServiceRole, event.id, event);
      results.push({ event_id: event.id, source_event_id: event.source_event_id, ...result });
      if (result.status === 'ACKNOWLEDGED') acknowledged++;
      else if (result.status === 'DELIVERED') delivered++;
      else if (result.status === 'FAILED') failed++;
      else if (result.status === 'REVIEW_REQUIRED') reviewRequired++;
    }

    return Response.json({
      status: 'batch_complete',
      processed: results.length,
      acknowledged,
      delivered,
      failed,
      review_required: reviewRequired,
      results,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Deliver a single PrepaidCompensationEvent to Arriv Pay.
 * Updates delivery_status based on the response.
 */
async function deliverOneEvent(base44, eventId, existingEvent = null) {
  // Fetch the event if not provided
  let event = existingEvent;
  if (!event) {
    try {
      event = await base44.entities.PrepaidCompensationEvent.get(eventId);
    } catch {
      return { error: 'Event not found', status: 'FAILED' };
    }
  }
  if (!event) return { error: 'Event not found', status: 'FAILED' };

  // Skip if already acknowledged
  if (event.delivery_status === 'ACKNOWLEDGED') {
    return { status: 'ACKNOWLEDGED', message: 'Already acknowledged' };
  }

  const apiSecret = secrets.get("ARRIV_PAYROLL_API_SECRET");
  const payEndpoint = secrets.get("ARRIV_PAYROLL_API_ENDPOINT");

  if (!apiSecret) {
    return { error: 'ARRIV_PAYROLL_API_SECRET not configured', status: 'FAILED' };
  }
  if (!payEndpoint) {
    return { error: 'ARRIV_PAYROLL_API_ENDPOINT not configured', status: 'FAILED' };
  }

  // Build the compensation payload for Arriv Pay
  const payload = {
    source_system: event.source_system || 'ARRIV_ESTATE_MEDIA',
    source_event_id: event.source_event_id,
    source_type: event.source_type,
    employee_id: event.employee_id,
    employee_email: event.employee_email || '',
    customer_id: event.customer_id || '',
    transaction_id: event.transaction_id || '',
    gross_customer_cash: event.gross_customer_cash || 0,
    commission_amount: event.commission_amount,
    currency: event.currency || 'USD',
    earned_at: event.earned_at,
    effective_at: event.effective_at || event.earned_at,
    prepaid_tier: event.prepaid_tier || '',
    idempotency_key: event.idempotency_key || event.source_event_id,
    reverses_source_event_id: event.reverses_source_event_id || '',
    reversal_amount: event.reversal_amount || 0,
    reason: event.reason || '',
  };

  const bodyStr = JSON.stringify(payload);
  const timestamp = Date.now().toString();
  const requestId = 'req_' + crypto.randomUUID();
  const sourceAppId = 'arriv_estate_media';

  // Sign with canonical 4-field format
  const signature = await signRequest(apiSecret, {
    body: bodyStr,
    timestamp,
    requestId,
    sourceAppId,
  });

  // Construct the Arriv Pay compensation endpoint URL
  const base = payEndpoint.replace(/\/functions\/.*$/i, '').replace(/\/$/, '');
  const url = base + '/functions/receiveEstateMediaCompensation';

  // Mark as DELIVERED (request about to be sent)
  const nowIso = new Date().toISOString();
  await base44.entities.PrepaidCompensationEvent.update(eventId, {
    delivery_status: 'DELIVERED',
    delivery_attempts: (event.delivery_attempts || 0) + 1,
    delivered_at: nowIso,
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
    // Transport failure → RETRYING with exponential backoff
    const nextAttempt = (event.delivery_attempts || 0) + 1;
    await base44.entities.PrepaidCompensationEvent.update(eventId, {
      delivery_status: 'RETRYING',
      delivery_attempts: nextAttempt,
      reason: `Transport failure: ${err.message}`,
    });
    return {
      status: 'RETRYING',
      error: err.message,
      next_retry_delay_ms: backoffDelayMs(nextAttempt),
    };
  }

  // Arriv Pay acknowledged successfully
  if (resp.ok && respData && (respData.acknowledged || respData.status === 'acknowledged' || respData.success)) {
    await base44.entities.PrepaidCompensationEvent.update(eventId, {
      delivery_status: 'ACKNOWLEDGED',
      delivered_to_payroll: true,
      delivered_at: respData.acknowledged_at || nowIso,
      reason: '',
    });
    return {
      status: 'ACKNOWLEDGED',
      source_event_id: event.source_event_id,
      acknowledged_at: respData.acknowledged_at || nowIso,
      payroll_acknowledgment: respData,
    };
  }

  // Non-retryable error → FAILED or REVIEW_REQUIRED
  const errMsg = (respData && (respData.error || respData.message)) ||
    `Arriv Pay rejected with status ${resp.status}`;

  const isNonRetryable = isNonRetryableError(respData?.code, errMsg) ||
    resp.status === 400 || resp.status === 401 || resp.status === 403;

  const newStatus = isNonRetryable ? 'REVIEW_REQUIRED' : 'RETRYING';

  await base44.entities.PrepaidCompensationEvent.update(eventId, {
    delivery_status: newStatus,
    delivery_attempts: (event.delivery_attempts || 0) + 1,
    reason: errMsg,
  });

  return {
    status: newStatus,
    error: errMsg,
    http_status: resp.status,
    payroll_response: respData,
  };
}