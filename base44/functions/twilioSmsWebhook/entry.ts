import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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
  try {
    const body = await req.text();
    const params = new URLSearchParams(body);

    const from = params.get('From');
    const to = params.get('To');
    const messageBody = params.get('Body');
    const twilioSid = params.get('MessageSid');

    const base44 = createClientFromRequest(req);

    // --- Media-specialist relay ---
    // If the sender is the client or the confirmed media specialist on an
    // active job, relay texts between the two and keep a full record of the
    // thread (one conversation per client's number).
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

          // One conversation per client (the thread anchor).
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
            });
          }

          // Record the inbound message (from the sender to the company number).
          await base44.asServiceRole.entities.SmsMessage.create({
            conversation_id: conversation.id,
            from_number: from,
            to_number: to,
            body: messageBody,
            direction: 'inbound',
            twilio_sid: twilioSid,
          });

          // Relay to the counterpart on their phone.
          try {
            const sent = await sendTwilioSms(counterpartE164, messageBody);
            await base44.asServiceRole.entities.SmsMessage.create({
              conversation_id: conversation.id,
              from_number: companyE164,
              to_number: counterpartE164,
              body: messageBody,
              direction: 'outbound',
              twilio_sid: sent?.sid || '',
            });
          } catch (e) {
            console.error('Relay SMS send failed:', e.message);
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