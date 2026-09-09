import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { auditLog } from '../../shared/securityAudit.ts';
import { validateTwilioRequest } from '../../shared/twilioWebhookValidation.ts';

const norm = (n) => {
  if (!n) return '';
  let d = String(n).replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d;
};

const e164 = (n) => {
  if (!n) return '';
  return n.startsWith('+') ? n : '+1' + String(n).replace(/\D/g, '');
};

// Sends an outbound SMS from the company number via the Twilio REST API.
async function sendTwilioSms(to, body) {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from = Deno.env.get('TWILIO_CALLING_PHONE_NUMBER') || Deno.env.get('TWILIO_PHONE_NUMBER');
  if (!sid || !token || !from) throw new Error('Twilio SMS credentials not configured');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${sid}:${token}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
  });
  return res.json();
}



Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    const body = await req.text();

    // ── Twilio webhook signature verification ──
    // Round 1 found NO authentication on this webhook. Now verified.
    const signatureValid = await validateTwilioRequest(req, body);
    if (!signatureValid) {
      await auditLog(base44, req, {
        event_type: 'webhook_verification_failure',
        actor_type: 'webhook',
        action: 'twilioSmsWebhook',
        result: 'denied',
        reason: 'invalid_twilio_signature',
      });
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
        status: 403,
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    const params = new URLSearchParams(body);

    const from = params.get('From');
    const to = params.get('To');
    const messageBody = params.get('Body');
    const twilioSid = params.get('MessageSid');

    // --- Media-specialist relay ---
    const senderNorm = norm(from);
    if (senderNorm) {
      try {
        const booked = await base44.asServiceRole.entities.Job.filter({ status: 'booked' });
        const inProg = await base44.asServiceRole.entities.Job.filter({ status: 'in_progress' });
        const active = [...(booked || []), ...(inProg || [])];

        const today = new Date().toISOString().slice(0, 10);
        const relayJobs = active.filter(
          (j) =>
            (j.client_phone && norm(j.client_phone) === senderNorm) ||
            (j.booked_by_phone && norm(j.booked_by_phone) === senderNorm)
        );
        let relayJob = relayJobs.find((j) => j.status === 'in_progress');
        if (!relayJob) relayJob = relayJobs.find((j) => (j.date || '').slice(0, 10) === today);
        if (!relayJob) {
          relayJob = relayJobs
            .filter((j) => j.status === 'booked' && (j.date || '').slice(0, 10) >= today)
            .sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0];
        }

        if (relayJob && relayJob.client_phone && relayJob.booked_by_phone) {
          const isClient = norm(relayJob.client_phone) === senderNorm;
          const counterpart = isClient ? relayJob.booked_by_phone : relayJob.client_phone;
          const counterpartE164 = e164(counterpart);
          const clientE164 = e164(relayJob.client_phone);
          const companyE164 = e164(to);
          const adminPhone = Deno.env.get('ADMIN_PHONE') ? e164(Deno.env.get('ADMIN_PHONE')) : '';

          const existing = await base44.asServiceRole.entities.SmsConversation.filter({
            from_number: clientE164,
          });
          let conversation;
          if (existing && existing.length > 0) {
            conversation = existing[0];
            await base44.asServiceRole.entities.SmsConversation.update(conversation.id, {
              last_message: messageBody,
              last_message_at: new Date().toISOString(),
              unread_count: (conversation.unread_count || 0) + 1,
              job_id: relayJob.id,
              media_partner_phone: relayJob.booked_by_phone,
            });
          } else {
            conversation = await base44.asServiceRole.entities.SmsConversation.create({
              from_number: clientE164,
              last_message: messageBody,
              last_message_at: new Date().toISOString(),
              unread_count: 1,
              job_id: relayJob.id,
              media_partner_phone: relayJob.booked_by_phone,
              routing_preference: 'unset',
            });
          }

          await base44.asServiceRole.entities.SmsMessage.create({
            conversation_id: conversation.id,
            from_number: from,
            to_number: to,
            body: messageBody,
            direction: 'inbound',
            twilio_sid: twilioSid,
          });

          const recordOutbound = async (toNum, body, sid) => {
            await base44.asServiceRole.entities.SmsMessage.create({
              conversation_id: conversation.id,
              from_number: companyE164,
              to_number: toNum,
              body,
              direction: 'outbound',
              twilio_sid: sid || '',
            });
          };

          if (isClient) {
            const lower = (messageBody || '').toLowerCase().trim();
            const isSupportKeyword = lower === 'support';
            const isPartnerKeyword =
              lower === 'media partner' || lower === 'media' || lower === 'partner';
            let preference = conversation.routing_preference || 'unset';

            if (isSupportKeyword) preference = 'support';
            else if (isPartnerKeyword) preference = 'media_partner';

            if (isSupportKeyword || isPartnerKeyword) {
              await base44.asServiceRole.entities.SmsConversation.update(conversation.id, {
                routing_preference: preference,
              });
              const confirm =
                preference === 'media_partner'
                  ? "Got it — you're now texting your media partner. Text 'Support' anytime to switch."
                  : "Got it — you're now texting support. Text 'Media Partner' anytime to switch.";
              try {
                const sent = await sendTwilioSms(clientE164, confirm);
                await recordOutbound(clientE164, confirm, sent?.sid);
              } catch (e) {
                console.error('Confirm SMS send failed:', e.message);
              }
              return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
                headers: { 'Content-Type': 'text/xml' },
              });
            }

            if (preference === 'unset') {
              const prompt =
                "Are you trying to contact your media partner or support? Reply 'Media Partner' or 'Support'. You can change your choice anytime by texting 'Media Partner' or 'Support'.";
              try {
                const sent = await sendTwilioSms(clientE164, prompt);
                await recordOutbound(clientE164, prompt, sent?.sid);
              } catch (e) {
                console.error('Prompt SMS send failed:', e.message);
              }
              return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
                headers: { 'Content-Type': 'text/xml' },
              });
            }

            if (preference === 'media_partner') {
              const clientName = (relayJob.client_name || '').trim();
              const forwardedBody = clientName
                ? `[Client: ${clientName}] ${messageBody}`
                : messageBody;
              try {
                const sent = await sendTwilioSms(counterpartE164, forwardedBody);
                await recordOutbound(counterpartE164, forwardedBody, sent?.sid);
              } catch (e) {
                console.error('Relay SMS send failed:', e.message);
              }
            } else if (preference === 'support') {
              const clientName = (relayJob.client_name || '').trim();
              const toSupport = clientName ? `[Client: ${clientName}] ${messageBody}` : messageBody;
              if (adminPhone) {
                try {
                  const sent = await sendTwilioSms(adminPhone, toSupport);
                  await recordOutbound(adminPhone, toSupport, sent?.sid);
                } catch (e) {
                  console.error('Support SMS send failed:', e.message);
                }
              }
            }
          } else {
            const specialistFirst = ((relayJob.booked_by_name || '').trim().split(/\s+/)[0]) || '';
            const forwardedBody = specialistFirst
              ? `[Media Specialist: ${specialistFirst}] ${messageBody}`
              : messageBody;
            try {
              const sent = await sendTwilioSms(counterpartE164, forwardedBody);
              await recordOutbound(counterpartE164, forwardedBody, sent?.sid);
            } catch (e) {
              console.error('Relay SMS send failed:', e.message);
            }
            if (adminPhone) {
              try {
                const copy = `[Copy to client] ${forwardedBody}`;
                const sentCopy = await sendTwilioSms(adminPhone, copy);
                await recordOutbound(adminPhone, copy, sentCopy?.sid);
              } catch (e) {
                console.error('Admin copy SMS send failed:', e.message);
              }
            }
          }

          return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
            headers: { 'Content-Type': 'text/xml' },
          });
        }
      } catch (e) {
        console.error('Media-specialist SMS relay failed:', e.message);
      }
    }

    // --- Default: route to a sales rep's inbox ---
    const reps = await base44.asServiceRole.entities.SalesTeamMember.filter({ twilio_phone_number: to });
    const salesMemberId = reps && reps.length > 0 ? reps[0].id : null;

    const existing = await base44.asServiceRole.entities.SmsConversation.filter({ from_number: from });
    let conversation;
    if (existing && existing.length > 0) {
      conversation = existing[0];
      const updateData = {
        last_message: messageBody,
        last_message_at: new Date().toISOString(),
        unread_count: (conversation.unread_count || 0) + 1,
      };
      if (salesMemberId && !conversation.sales_member_id) {
        updateData.sales_member_id = salesMemberId;
      }
      await base44.asServiceRole.entities.SmsConversation.update(conversation.id, updateData);
    } else {
      conversation = await base44.asServiceRole.entities.SmsConversation.create({
        from_number: from,
        last_message: messageBody,
        last_message_at: new Date().toISOString(),
        unread_count: 1,
        sales_member_id: salesMemberId,
      });
    }

    await base44.asServiceRole.entities.SmsMessage.create({
      conversation_id: conversation.id,
      from_number: from,
      to_number: to,
      body: messageBody,
      direction: 'inbound',
      twilio_sid: twilioSid,
    });

    return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('SMS webhook error:', error);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
      headers: { 'Content-Type': 'text/xml' },
    });
  }
});