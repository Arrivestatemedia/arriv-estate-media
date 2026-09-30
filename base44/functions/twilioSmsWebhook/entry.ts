import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { auditLog } from '../../shared/securityAudit.ts';
import { validateTwilioRequest } from '../../shared/twilioWebhookValidation.ts';
import { containsPersonalPhoneNumber } from '../../shared/phoneNumberBlocker.ts';
import { parseAccessSms, applyClientAccessSelection } from '../../shared/clientAccessSelection.ts';

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

// Parse a "support: <message>" prefix (or bare "support") from an SMS body.
function parseSupportPrefix(body: string): { isSupport: boolean; message: string } {
  const raw = (body || '').trim();
  const m = raw.match(/^support\s*:\s*(.*)$/i);
  if (m) return { isSupport: true, message: m[1].trim() };
  if (raw.toLowerCase().trim() === 'support') return { isSupport: true, message: '' };
  return { isSupport: false, message: '' };
}

// Open (or refresh) a 15-minute support session so admin replies route back
// to this participant. Ends any prior active session for the same target.
async function openSupportSession(
  base44: any,
  opts: { targetPhone: string; targetName: string; targetRole: string; jobId?: string; companyNumber: string },
) {
  const now = new Date();
  try {
    const existing = await base44.asServiceRole.entities.SupportSession.filter({
      status: 'active',
      target_phone: opts.targetPhone,
      company_number: opts.companyNumber,
    });
    for (const s of (existing || [])) {
      if (new Date(s.expires_at) > now) {
        await base44.asServiceRole.entities.SupportSession.update(s.id, {
          status: 'ended',
          ended_at: now.toISOString(),
          ended_reason: 'superseded',
        });
      }
    }
  } catch (e) {
    console.error('End prior support session failed:', e.message);
  }
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
  await base44.asServiceRole.entities.SupportSession.create({
    target_phone: opts.targetPhone,
    target_name: opts.targetName,
    target_role: opts.targetRole,
    job_id: opts.jobId,
    company_number: opts.companyNumber,
    status: 'active',
    expires_at: expiresAt,
  });
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    const body = await req.text();
    // v2: candidate-URL based Twilio signature validation

    // DEBUG: Write request info to MessageLog BEFORE validation
    try {
      const appDomain = Deno.env.get('BASE44_APP_DOMAIN');
      const candidates = [];
      const bases = [];
      if (appDomain) bases.push(appDomain.replace(/\/+$/, ''));
      bases.push('https://arrivestatemedia.base44.app');
      for (const base of bases) {
        for (const prefix of ['', '/api']) {
          candidates.push(`${base}${prefix}/functions/twilioSmsWebhook`);
        }
      }
      const debugInfo = {
        reqUrl: req.url,
        method: req.method,
        contentType: req.headers.get('content-type'),
        hasSignature: !!req.headers.get('x-twilio-signature'),
        bodyPreview: body.substring(0, 500),
        appDomain: appDomain,
        candidateUrls: candidates,
      };
      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'sms',
        recipient_type: 'admin',
        message_content: JSON.stringify(debugInfo),
        subject: 'TWILIO_WEBHOOK_DEBUG',
        status: 'success',
      });
    } catch (e) { console.log('debug log failed:', e.message); }

    // ── Twilio webhook signature verification ──
    const signatureValid = await validateTwilioRequest(req, body, 'twilioSmsWebhook');
    if (!signatureValid) {
      const debug = (req as any).__twilioDebug;
      console.log('TWILIO SMS VALIDATION FAILED', JSON.stringify(debug, null, 2));
      try {
        await auditLog(base44, req, {
          event_type: 'webhook_verification_failure',
          actor_type: 'webhook',
          action: 'twilioSmsWebhook',
          result: 'denied',
          reason: 'invalid_twilio_signature',
        });
      } catch (_) {}
      // TEMPORARY: return debug info as JSON for diagnosis
      return new Response(JSON.stringify(debug, null, 2), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const params = new URLSearchParams(body);

    const from = params.get('From');
    const to = params.get('To');
    const messageBody = params.get('Body');
    const twilioSid = params.get('MessageSid');

    const senderNorm = norm(from);

    // ── Admin sender: route support replies back to the specialist/client ──
    const adminPhoneEnv = Deno.env.get('ADMIN_PHONE');
    const adminNorm = adminPhoneEnv ? norm(adminPhoneEnv) : '';
    if (adminNorm && senderNorm === adminNorm) {
      const companyE164 = e164(to);
      const lower = (messageBody || '').toLowerCase().trim();
      const now = new Date();

      // "New message" → end the most recent active session
      if (lower === 'new message') {
        try {
          const active = await base44.asServiceRole.entities.SupportSession.filter({ status: 'active', company_number: companyE164 });
          active.sort((a, b) => (b.created_date || '').localeCompare(a.created_date || ''));
          const session = active[0];
          if (session) {
            await base44.asServiceRole.entities.SupportSession.update(session.id, {
              status: 'ended', ended_at: now.toISOString(), ended_reason: 'admin_new_message',
            });
            try { await sendTwilioSms(e164(session.target_phone), "Your support session has ended. Text 'support: your message' to start a new one. - Arriv"); } catch (e) { console.error('End-session notify failed:', e.message); }
            const remaining = active.length - 1;
            try { await sendTwilioSms(e164(from), remaining > 0 ? `Session ended. ${remaining} more active session(s).` : 'Session ended. No active sessions.'); } catch (e) { console.error('Admin confirm failed:', e.message); }
          } else {
            try { await sendTwilioSms(e164(from), 'No active support session to end.'); } catch (e) {}
          }
        } catch (e) { console.error('New message handling failed:', e.message); }
        return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, { headers: { 'Content-Type': 'text/xml' } });
      }

      // ── Fallback 1: "to +<number>" prefix → route directly to that number ──
      // The admin can explicitly address a reply to a specific person, even
      // if no support session is active. iMessage sometimes auto-prepends this
      // when replying to a forwarded message.
      const toMatch = (messageBody || '').match(/^to\s*\+?(\d{10,11})\s*\n?[\s\n]*/i);
      let explicitTarget = '';
      let cleanBody = messageBody || '';
      if (toMatch) {
        explicitTarget = norm(toMatch[1]);
        cleanBody = (messageBody || '').replace(toMatch[0], '').trim();
      }

      // Route reply to most recent active, non-expired session
      try {
        let session;
        if (explicitTarget) {
          // Try to find an active session for the explicitly addressed target
          const targetSessions = await base44.asServiceRole.entities.SupportSession.filter({ status: 'active', target_phone: explicitTarget, company_number: companyE164 });
          session = targetSessions && targetSessions[0];
        }
        if (!session) {
          const active = await base44.asServiceRole.entities.SupportSession.filter({ status: 'active', company_number: companyE164 });
          active.sort((a, b) => (b.created_date || '').localeCompare(a.created_date || ''));
          const valid = [];
          for (const s of active) {
            if (new Date(s.expires_at) > now) valid.push(s);
            else { await base44.asServiceRole.entities.SupportSession.update(s.id, { status: 'ended', ended_at: now.toISOString(), ended_reason: 'expired' }); }
          }
          session = valid[0];
        }
        if (session) {
          try { await sendTwilioSms(e164(session.target_phone), cleanBody); } catch (e) { console.error('Admin reply relay failed:', e.message); }
        } else if (explicitTarget) {
          // No session but admin specified a target — route directly
          try { await sendTwilioSms(e164(explicitTarget), cleanBody); } catch (e) { console.error('Admin explicit-target relay failed:', e.message); }
        } else {
          // ── Fallback 2: no session, no explicit target — find the most
          // recent person who texted support to this relay number ──
          const recentInbound = await base44.asServiceRole.entities.SmsMessage.filter({
            to_number: e164(to),
            direction: 'inbound',
          });
          recentInbound.sort((a, b) => (b.created_date || '').localeCompare(a.created_date || ''));
          const cutoff = new Date(now.getTime() - 30 * 60 * 1000);
          const recentSender = recentInbound.find((m) => {
            const senderNorm = norm(m.from_number);
            return senderNorm && senderNorm !== adminNorm && new Date(m.created_date) > cutoff;
          });
          if (recentSender) {
            try { await sendTwilioSms(e164(norm(recentSender.from_number)), cleanBody); } catch (e) { console.error('Admin fallback relay failed:', e.message); }
          } else {
            try { await sendTwilioSms(e164(from), 'No active support session to reply to. Sessions expire after 15 minutes. To reply to a specific person, start your message with "to +<number>".'); } catch (e) {}
          }
        }
      } catch (e) { console.error('Admin reply routing failed:', e.message); }
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, { headers: { 'Content-Type': 'text/xml' } });
    }

    // --- Media-specialist relay ---
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

          // ── Personal phone number blocking ──
          // If the sender's own phone number appears in the message (digit
          // or word form), block it from being relayed and notify the sender.
          if (containsPersonalPhoneNumber(from, messageBody)) {
            const blockMsg = "Your message was not sent because it contains your personal phone number. Please remove your phone number from the message and try again. - Arriv";
            try {
              const senderE164 = from.startsWith('+') ? from : `+1${from.replace(/\D/g, '')}`;
              const sent = await sendTwilioSms(senderE164, blockMsg);
              await base44.asServiceRole.entities.SmsMessage.create({
                conversation_id: conversation.id,
                from_number: to,
                to_number: from,
                body: blockMsg,
                direction: 'outbound',
                twilio_sid: sent?.sid || '',
              });
            } catch (e) {
              console.error('Block notification SMS send failed:', e.message);
            }
            return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
              headers: { 'Content-Type': 'text/xml' },
            });
          }

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
            // ── Property access selection (24h flow) ──
            // If this job has a pending access request, interpret the inbound
            // message as an access selection or support request before the
            // normal routing-preference logic. Once the client selects, the
            // request is no longer pending and normal SMS routing resumes.
            if (relayJob.client_access_request_sent_at && (!relayJob.client_access_selection || relayJob.client_access_selection === 'pending')) {
              const parsed = parseAccessSms(messageBody);
              if (parsed.kind === 'selection') {
                try {
                  await applyClientAccessSelection(base44, relayJob, parsed.selection, 'sms');
                } catch (e) {
                  console.error('Access selection apply failed:', e.message);
                }
                return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
                  headers: { 'Content-Type': 'text/xml' },
                });
              }
              if (parsed.kind === 'support') {
                const clientName = (relayJob.client_name || '').trim();
                const toSupport = clientName
                  ? `[Client: ${clientName}] ${parsed.message || messageBody}`
                  : (parsed.message || messageBody);
                if (adminPhone) {
                  try {
                    const sent = await sendTwilioSms(adminPhone, toSupport);
                    await recordOutbound(adminPhone, toSupport, sent?.sid);
                  } catch (e) {
                    console.error('Support SMS send failed:', e.message);
                  }
                }
                try {
                  await openSupportSession(base44, {
                    targetPhone: senderNorm, targetName: clientName, targetRole: 'client',
                    jobId: relayJob.id, companyNumber: companyE164,
                  });
                } catch (e) { console.error('Open support session failed:', e.message); }
                const ack = "Got it — your message is on its way to our team. We'll be in touch shortly.";
                try {
                  const sent = await sendTwilioSms(clientE164, ack);
                  await recordOutbound(clientE164, ack, sent?.sid);
                } catch (e) {
                  console.error('Support ack SMS send failed:', e.message);
                }
                return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
                  headers: { 'Content-Type': 'text/xml' },
                });
              }
              // Unknown — re-prompt with instructions
              const rePrompt =
                "Please reply with:\n1 = I'll be on site\n2 = Grant lockbox access\nOr text 'support: your message' to reach our team.";
              try {
                const sent = await sendTwilioSms(clientE164, rePrompt);
                await recordOutbound(clientE164, rePrompt, sent?.sid);
              } catch (e) {
                console.error('Access re-prompt SMS send failed:', e.message);
              }
              return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
                headers: { 'Content-Type': 'text/xml' },
              });
            }

            const lower = (messageBody || '').toLowerCase().trim();
            const supportParsed = parseSupportPrefix(messageBody);
            const isSupportKeyword = supportParsed.isSupport;
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
              // "support: <message>" → forward now and open a reply session
              if (isSupportKeyword && supportParsed.message) {
                const clientName = (relayJob.client_name || '').trim();
                const toSupport = clientName ? `[Client: ${clientName}] ${supportParsed.message}` : supportParsed.message;
                if (adminPhone) {
                  try {
                    const sent = await sendTwilioSms(adminPhone, toSupport);
                    await recordOutbound(adminPhone, toSupport, sent?.sid);
                  } catch (e) { console.error('Support SMS send failed:', e.message); }
                }
                try {
                  await openSupportSession(base44, {
                    targetPhone: senderNorm, targetName: clientName, targetRole: 'client',
                    jobId: relayJob.id, companyNumber: companyE164,
                  });
                } catch (e) { console.error('Open support session failed:', e.message); }
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
              try {
                await openSupportSession(base44, {
                  targetPhone: senderNorm, targetName: clientName, targetRole: 'client',
                  jobId: relayJob.id, companyNumber: companyE164,
                });
              } catch (e) { console.error('Open support session failed:', e.message); }
            }
          } else {
            // ── Media-specialist routing preference ──
            // Mirrors the client side: the specialist can choose to text their
            // client or support (admin). First text prompts them to pick;
            // they can switch anytime by texting "Client" or "Support".
            const specialistFirst = ((relayJob.booked_by_name || '').trim().split(/\s+/)[0]) || '';
            const senderE164 = e164(from);
            let partnerPref = conversation.media_partner_routing_preference || 'unset';

            const lower = (messageBody || '').toLowerCase().trim();
            const supportParsed = parseSupportPrefix(messageBody);
            const isSupportKeyword = supportParsed.isSupport;
            const isClientKeyword = lower === 'client';

            if (isSupportKeyword) partnerPref = 'support';
            else if (isClientKeyword) partnerPref = 'client';

            if (isSupportKeyword || isClientKeyword) {
              await base44.asServiceRole.entities.SmsConversation.update(conversation.id, {
                media_partner_routing_preference: partnerPref,
              });
              const confirm = partnerPref === 'support'
                ? "Got it — you're now texting support. Text 'Client' anytime to switch back to your client."
                : "Got it — you're now texting your client. Text 'Support' anytime to switch.";
              try {
                const sent = await sendTwilioSms(senderE164, confirm);
                await recordOutbound(senderE164, confirm, sent?.sid);
              } catch (e) {
                console.error('Confirm SMS send failed:', e.message);
              }
              // "support: <message>" → forward the message now and open a reply session
              if (isSupportKeyword && supportParsed.message) {
                const toSupport = specialistFirst
                  ? `[Media Specialist: ${specialistFirst}] ${supportParsed.message}`
                  : supportParsed.message;
                if (adminPhone) {
                  try {
                    const sent = await sendTwilioSms(adminPhone, toSupport);
                    await recordOutbound(adminPhone, toSupport, sent?.sid);
                  } catch (e) { console.error('Support SMS send failed:', e.message); }
                }
                try {
                  await openSupportSession(base44, {
                    targetPhone: senderNorm, targetName: specialistFirst, targetRole: 'media_specialist',
                    jobId: relayJob.id, companyNumber: companyE164,
                  });
                } catch (e) { console.error('Open support session failed:', e.message); }
              }
              return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
                headers: { 'Content-Type': 'text/xml' },
              });
            }

            if (partnerPref === 'unset') {
              const prompt = "Are you trying to contact your client or support? Reply 'Client' or 'Support'. You can change your choice anytime.";
              try {
                const sent = await sendTwilioSms(senderE164, prompt);
                await recordOutbound(senderE164, prompt, sent?.sid);
              } catch (e) {
                console.error('Prompt SMS send failed:', e.message);
              }
              return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
                headers: { 'Content-Type': 'text/xml' },
              });
            }

            if (partnerPref === 'support') {
              const toSupport = specialistFirst
                ? `[Media Specialist: ${specialistFirst}] ${messageBody}`
                : messageBody;
              if (adminPhone) {
                try {
                  const sent = await sendTwilioSms(adminPhone, toSupport);
                  await recordOutbound(adminPhone, toSupport, sent?.sid);
                } catch (e) {
                  console.error('Support SMS send failed:', e.message);
                }
              }
              try {
                await openSupportSession(base44, {
                  targetPhone: senderNorm, targetName: specialistFirst, targetRole: 'media_specialist',
                  jobId: relayJob.id, companyNumber: companyE164,
                });
              } catch (e) { console.error('Open support session failed:', e.message); }
            } else {
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
          }

          return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
            headers: { 'Content-Type': 'text/xml' },
          });
        }

        // ── No active job: route known specialists/clients to admin ──
        // If the sender has job history but no currently active job, their
        // message goes straight to admin — no "who are you trying to reach?"
        // prompt. "support: {message}" extracts just the message portion.
        {
          const recentJobs = await base44.asServiceRole.entities.Job.list('-created_date', 500);
          const senderJobs = recentJobs.filter(j =>
            (j.booked_by_phone && norm(j.booked_by_phone) === senderNorm) ||
            (j.client_phone && norm(j.client_phone) === senderNorm)
          );
          if (senderJobs.length > 0) {
            const companyE164 = e164(to);
            const adminPhone = Deno.env.get('ADMIN_PHONE') ? e164(Deno.env.get('ADMIN_PHONE')) : '';
            const isSpecialist = senderJobs.some(j => j.booked_by_phone && norm(j.booked_by_phone) === senderNorm);
            const job = senderJobs[0];
            const name = isSpecialist
              ? ((job.booked_by_name || '').trim().split(/\s+/)[0]) || ''
              : (job.client_name || '').trim();
            const role = isSpecialist ? 'media_specialist' : 'client';
            const supportParsed = parseSupportPrefix(messageBody);
            const bodyToSend = supportParsed.isSupport ? (supportParsed.message || messageBody) : messageBody;
            const prefix = isSpecialist
              ? `[Media Specialist: ${name}] `
              : name ? `[Client: ${name}] ` : '';
            const toAdmin = `${prefix}${bodyToSend}`;
            if (adminPhone) {
              try {
                const sent = await sendTwilioSms(adminPhone, toAdmin);
                await base44.asServiceRole.entities.SmsMessage.create({
                  from_number: companyE164, to_number: adminPhone, body: toAdmin,
                  direction: 'outbound', twilio_sid: sent?.sid || '',
                });
              } catch (e) { console.error('No-job support SMS send failed:', e.message); }
            }
            try {
              await openSupportSession(base44, {
                targetPhone: senderNorm, targetName: name, targetRole: role,
                companyNumber: companyE164,
              });
            } catch (e) { console.error('Open support session failed:', e.message); }
            try {
              await base44.asServiceRole.entities.SmsMessage.create({
                from_number: from, to_number: to, body: messageBody,
                direction: 'inbound', twilio_sid: twilioSid || '',
              });
            } catch (e) { console.error('Record inbound failed:', e.message); }
            if (supportParsed.isSupport && supportParsed.message) {
              const ack = "Got it — your message is on its way to our team. We'll be in touch shortly.";
              try {
                const sent = await sendTwilioSms(e164(from), ack);
                await base44.asServiceRole.entities.SmsMessage.create({
                  from_number: companyE164, to_number: e164(from), body: ack,
                  direction: 'outbound', twilio_sid: sent?.sid || '',
                });
              } catch (e) { console.error('Ack SMS send failed:', e.message); }
            }
            return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
              headers: { 'Content-Type': 'text/xml' },
            });
          }
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