/**
 * ivrCallEvents — Twilio status callback for every inbound call.
 *
 * Records the final outcome, duration and end time on the CallRecord so the
 * Call Center overview can report answered vs missed without touching the
 * existing Inbound Calls view.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { validateTwilioRequest } from '../../shared/twilioWebhookValidation.ts';
import { parseCall, callContext, upsertCall, e164, receivingLine } from '../../shared/ivr.ts';

Deno.serve(async (req) => {
  try {
    const { raw, params } = await parseCall(req);
    await validateTwilioRequest(req, raw, 'ivrCallEvents');

    const base44 = createClientFromRequest(req);
    const callSid = params.CallSid || '';
    const status = params.CallStatus || '';
    const duration = Number(params.CallDuration || '0');

    if (!callSid) return new Response('ok', { status: 200 });

    // A cellphone sales session lives inside this parent call. This number-level
    // callback is the only place that reliably learns the partner hung up, so any
    // terminal status closes the whole session and its open attempt.
    if (['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(status)) {
      await base44.asServiceRole.entities.SalesDialSession.updateMany(
        { parent_call_sid: callSid, status: 'active' },
        { $set: { status: 'ended', ended_at: new Date().toISOString(), termination_reason: `parent_${status}` } }
      ).catch(() => {});
      await base44.asServiceRole.entities.SalesCallAttempt.updateMany(
        { session_id: { $exists: true }, status: { $in: ['ringing', 'in_progress'] }, call_sid: callSid },
        { $set: { status: 'failed', ended_at: new Date().toISOString(), disconnect_reason: `parent_${status}` } }
      ).catch(() => {});
    }

    if (status !== 'completed') {
      return new Response('ok', { status: 200 });
    }

    const record = await callContext(base44, callSid);
    const route = record?.route || '';
    const endedAt = new Date().toISOString();

    let outcome = record?.outcome || 'in_progress';
    if (outcome === 'in_progress') {
      if (route === 'voicemail') outcome = 'voicemail';
      else if (route === 'callback') outcome = 'callback_requested';
      else if (route === 'ashley') outcome = record?.booking_id ? 'completed' : 'abandoned';
      else if (route === 'sales_ring' || route === 'public_menu' || route === 'support') {
        // No leg connected and the caller left quickly = abandoned call.
        outcome = duration >= 20 ? 'completed' : 'abandoned';
      } else {
        outcome = duration > 0 ? 'completed' : 'abandoned';
      }
    }

    if (record) {
      await upsertCall(base44, callSid, {
        outcome,
        ended_at: endedAt,
        duration_seconds: duration,
        stage: record.stage || 'status_callback',
      });
    } else {
      await upsertCall(base44, callSid, {
        from_number: e164(params.From),
        to_number: e164(params.To),
        receiving_line: receivingLine(params.To),
        outcome,
        ended_at: endedAt,
        duration_seconds: duration,
      });
    }

    return new Response('ok', { status: 200 });
  } catch (e) {
    console.error('[ivrCallEvents] failed:', (e as Error).message);
    return new Response('ok', { status: 200 });
  }
});