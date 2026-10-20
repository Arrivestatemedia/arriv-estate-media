import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { validateTwilioRequest } from '../../shared/twilioWebhookValidation.ts';
import { auditLog } from '../../shared/securityAudit.ts';

// Twilio voice status callback for the company number.
// Fires on every status change of an inbound call. We send the owner a text
// the moment a call is answered (in-progress) or missed (no-answer/busy/failed/canceled),
// so they never have to open the Twilio console just to see who called.
Deno.serve(async (req) => {
  try {
    const body = await req.text();

    // ── Twilio webhook signature verification ──
    const signatureValid = await validateTwilioRequest(req, body, 'handleMissedCall');
    if (!signatureValid) {
      try {
        const base44 = createClientFromRequest(req);
        await auditLog(base44, req, {
          event_type: 'webhook_verification_failure',
          actor_type: 'webhook',
          action: 'handleMissedCall',
          result: 'denied',
          reason: 'invalid_twilio_signature',
        });
      } catch (_) {}
      return new Response('OK', { status: 200 });
    }

    const params = new URLSearchParams(body);
    const callStatus = params.get('CallStatus') || '';
    const dialStatus = params.get('DialCallStatus') || '';
    const from = params.get('From') || '';

    // Number-level status callback (CallStatus) is preferred; the Dial action
    // callback (DialCallStatus) is a fallback for any Dial that points here.
    const missedStatuses = ['no-answer', 'busy', 'failed', 'canceled'];
    let answered = false;
    let missed = false;

    if (callStatus) {
      answered = callStatus === 'in-progress';
      missed = missedStatuses.includes(callStatus);
    } else if (dialStatus) {
      answered = dialStatus === 'completed';
      missed = missedStatuses.includes(dialStatus);
    }

    // ringing / completed (already notified on in-progress or no-answer) / unknown
    if (!answered && !missed) {
      return new Response('OK', { status: 200 });
    }

    const fromDisplay = from || 'Unknown';
    const smsBody = answered
      ? `✅ Answered call from ${fromDisplay}`
      : `📞 Missed call from ${fromDisplay}`;

    await sendOwnerSms(smsBody);

    // Preserve existing behavior: log a missed-call activity for each active rep.
    if (missed) {
      const base44 = createClientFromRequest(req);
      const activeMembers = await base44.asServiceRole.entities.SalesTeamMember.filter({ is_active: true });
      for (const member of activeMembers) {
        await base44.asServiceRole.entities.ActivityLog.create({
          activity_type: 'call',
          contact_name: from,
          contact_email: '',
          company_name: '',
          activity_date: new Date().toISOString(),
          notes: `Missed incoming call from ${from}`,
          duration_minutes: 0,
          missed: true,
          missed_acknowledged: false,
          sales_member_id: member.id,
          sales_member_email: member.email,
          hubspot_synced: false
        });
      }
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('handleMissedCall error:', error.message);
    return new Response('Error', { status: 500 });
  }
});

// Send an SMS to the owner from the company SMS number.
async function sendOwnerSms(body: string) {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from = Deno.env.get('TWILIO_PHONE_NUMBER');
  const to = Deno.env.get('OWNER_PHONE_NUMBER');
  if (!sid || !token || !from || !to) {
    console.error('sendOwnerSms: missing Twilio or OWNER_PHONE_NUMBER config');
    return;
  }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${sid}:${token}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: from, To: to, Body: body }).toString(),
    });
    if (!res.ok) {
      console.error('sendOwnerSms failed:', res.status, (await res.text()).slice(0, 200));
    }
  } catch (e) {
    console.error('sendOwnerSms error:', e.message);
  }
}