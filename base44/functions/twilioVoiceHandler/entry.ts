import twilio from 'npm:twilio@5.3.3';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const xmlResponse = (twiml) => new Response(twiml, {
  status: 200,
  headers: { 'Content-Type': 'text/xml; charset=utf-8' }
});

Deno.serve(async (req) => {
  try {
    const body = await req.text();
    const contentType = req.headers.get('content-type') || '';
    console.log('Content-Type:', contentType, 'Body:', body.substring(0, 300));

    // Parse body — Twilio sends application/x-www-form-urlencoded
    let to, from, digits;
    try {
      if (body.trim().startsWith('{')) {
        const json = JSON.parse(body);
        to = json.To;
        from = json.From;
        digits = json.Digits;
      } else {
        const params = new URLSearchParams(body);
        to = params.get('To');
        from = params.get('From');
        digits = params.get('Digits');
      }
    } catch (_) {
      const params = new URLSearchParams(body);
      to = params.get('To');
      from = params.get('From');
      digits = params.get('Digits');
    }

    // "menu" flag: set via query string on the Gather action URL (real Twilio flow),
    // with a body fallback for robustness/testing.
    const urlObj = new URL(req.url);
    let menu = urlObj.searchParams.get('menu');
    if (!menu) {
      try {
        const p = body.trim().startsWith('{') ? JSON.parse(body) : Object.fromEntries(new URLSearchParams(body));
        if (p && p.menu) menu = String(p.menu);
      } catch (_) {}
    }

    console.log('to:', to, 'from:', from, 'digits:', digits, 'menu:', menu);

    if (!to) {
      return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>No destination provided.</Say></Response>`);
    }

    const defaultCallerId = Deno.env.get('TWILIO_CALLING_PHONE_NUMBER');
    console.log('TWILIO_CALLING_PHONE_NUMBER:', defaultCallerId, '| TWILIO_PHONE_NUMBER:', Deno.env.get('TWILIO_PHONE_NUMBER'));
    if (!defaultCallerId) {
      console.error('TWILIO_CALLING_PHONE_NUMBER is not set! This will cause calls to fail or use wrong number.');
    }

    // Detect outbound call: From is a Twilio client identity like "client:sales_rep_xxx"
    const isOutbound = from?.startsWith('client:');

    if (isOutbound) {
      const dest = to.trim();
      const base44 = createClientFromRequest(req);

      // Identify the calling rep so we can use their personal Twilio number as caller ID
      const callerIdentity = from.replace('client:', '');
      const callerIdPart = callerIdentity.replace('sales_rep_', '').replace(/_/g, '-');
      let callerMember = null;
      try {
        const callerMembers = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: callerIdPart });
        callerMember = callerMembers?.[0] || null;
      } catch (e) {
        console.error('Failed to fetch caller member:', e.message);
      }
      // Only use the caller's personal Twilio number if it belongs to them
      const callerId = callerMember?.twilio_phone_number || defaultCallerId;
      console.log('Caller:', callerMember?.full_name, 'callerId:', callerId);

      // Check if dialing an extension (3 digits, 100-999)
      const extensionMatch = dest.match(/^(\d{3})$/);
      if (extensionMatch) {
        const extension = parseInt(extensionMatch[1]);
        console.log('Extension dial detected:', extension);

        let members = [];
        try {
          members = await base44.asServiceRole.entities.SalesTeamMember.filter({ is_active: true });
        } catch (e) {
          console.error('Failed to fetch members for extension lookup:', e.message);
        }

        const target = members.find(m => m.extension === extension);
        if (!target) {
          return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Extension ${extension} not found.</Say>
</Response>`);
        }

        const targetIdentity = `sales_rep_${target.id.replace(/-/g, '_')}`;
        const callerIdentityStr = callerMember ? `sales_rep_${callerMember.id.replace(/-/g, '_')}` : '';
        console.log('Extension → client identity:', targetIdentity, 'callerIdentity:', callerIdentityStr, 'cell fallback:', target.phone_number);

        // Always use company number as callerId for internal calls — never expose personal Twilio numbers
        // Pass caller identity as a custom parameter so the receiving browser dialer can display name/extension
        let twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${defaultCallerId}" answerOnBridge="true" timeout="25">
    <Client>
      <Identity>${targetIdentity}</Identity>
      <Parameter name="callerIdentity" value="${callerIdentityStr}"/>
      <Parameter name="callerName" value="${callerMember?.full_name || ''}"/>
      <Parameter name="callerExtension" value="${callerMember?.extension || ''}"/>
    </Client>
  </Dial>`;

        if (target.phone_number) {
          const cellNumber = target.phone_number.startsWith('+') ? target.phone_number : '+1' + target.phone_number.replace(/\D/g, '');
          twiml += `
  <Dial callerId="${defaultCallerId}" answerOnBridge="true" timeout="30">
    <Number>${cellNumber}</Number>
  </Dial>`;
        }

        twiml += `\n</Response>`;
        return xmlResponse(twiml);
      }

      const formattedDest = dest.startsWith('+') ? dest : '+1' + dest.replace(/\D/g, '');
      console.log('Outbound → dialing:', formattedDest, 'callerId:', callerId);

      return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${callerId}" answerOnBridge="true" timeout="30">
    <Number>${formattedDest}</Number>
  </Dial>
</Response>`);

    } else {
      // Inbound call — route to all active sales reps via Twilio Client
      console.log('Inbound from:', from, 'to:', to);

      const base44 = createClientFromRequest(req);

      // --- Media-partner shortcut ---
      // If the caller is a media partner booked on an active job, auto-bridge them
      // to that job's client. The client sees the company 800 number as caller ID.
      // Once the job is completed/cancelled it no longer matches, so the bridge
      // effectively lasts "until the job is over."
      const norm = (n) => {
        if (!n) return '';
        let d = String(n).replace(/\D/g, '');
        if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
        return d;
      };
      const callerNorm = norm(from);

      if (callerNorm && defaultCallerId) {
        try {
          const today = new Date().toISOString().slice(0, 10);
          const booked = await base44.asServiceRole.entities.Job.filter({ status: 'booked' });
          const inProg = await base44.asServiceRole.entities.Job.filter({ status: 'in_progress' });
          const candidates = [...(booked || []), ...(inProg || [])];
          const matches = candidates.filter(j =>
            j.client_phone &&
            (norm(j.booked_by_phone) === callerNorm || norm(j.backup_booked_by_phone) === callerNorm)
          );
          // Priority: in_progress job → booked job today → next upcoming booked job
          let job = matches.find(j => j.status === 'in_progress');
          if (!job) job = matches.find(j => (j.date || '').slice(0, 10) === today);
          if (!job) {
            job = matches
              .filter(j => j.status === 'booked' && (j.date || '').slice(0, 10) >= today)
              .sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0];
          }

          if (job) {
            const clientNumber = job.client_phone.startsWith('+')
              ? job.client_phone
              : '+1' + job.client_phone.replace(/\D/g, '');

            // Digit selection from the IVR menu
            if (digits === '1') {
              console.log('Media partner pressed 1 → bridging to client', clientNumber, 'for job', job.id);
              return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${defaultCallerId}" answerOnBridge="true" timeout="45">
    <Number>${clientNumber}</Number>
  </Dial>
</Response>`);
            }

            const appDomain = Deno.env.get('BASE44_APP_DOMAIN') || '';
            const actionUrl = appDomain ? `${appDomain}/functions/twilioVoiceHandler?menu=1` : '';

            // If this is a Gather result that wasn't "1" (pressed 2 or timed out),
            // fall through to the support / sales-rep routing below.
            if (menu === '1') {
              console.log('Media partner menu → routing to support (digit:', digits, ')');
            } else {
              // First contact — present the IVR menu
              console.log('Media partner inbound → presenting IVR menu for job', job.id);
              return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="${actionUrl}" method="POST" timeout="8" finishOnKey="">
    <Say voice="Polly.Joanna">To reach your client, press 1. To reach support, press 2.</Say>
  </Gather>
  <Say voice="Polly.Joanna">Connecting you to support.</Say>
</Response>`);
            }
          }
        } catch (e) {
          console.error('Media partner bridge lookup failed:', e.message);
        }
      }

      // --- Client IVR ---
      // If the caller is a client with a confirmed media specialist on an active
      // job, offer to bridge them to their specialist (press 1) or support (2).
      // Falls through to the support routing below otherwise.
      const cnorm = (n) => {
        if (!n) return '';
        let d = String(n).replace(/\D/g, '');
        if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
        return d;
      };
      const clientNorm = cnorm(from);
      if (clientNorm && defaultCallerId) {
        try {
          const today = new Date().toISOString().slice(0, 10);
          const cBooked = await base44.asServiceRole.entities.Job.filter({ status: 'booked' });
          const cInProg = await base44.asServiceRole.entities.Job.filter({ status: 'in_progress' });
          const cCandidates = [...(cBooked || []), ...(cInProg || [])];
          const clientJobs = cCandidates.filter(
            (j) => j.client_phone && cnorm(j.client_phone) === clientNorm
          );
          let clientJob = clientJobs.find((j) => j.status === 'in_progress');
          if (!clientJob) clientJob = clientJobs.find((j) => (j.date || '').slice(0, 10) === today);
          if (!clientJob) {
            clientJob = clientJobs
              .filter((j) => j.status === 'booked' && (j.date || '').slice(0, 10) >= today)
              .sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0];
          }

          if (clientJob && clientJob.booked_by_phone) {
            const partnerNumber = clientJob.booked_by_phone.startsWith('+')
              ? clientJob.booked_by_phone
              : '+1' + clientJob.booked_by_phone.replace(/\D/g, '');

            if (digits === '1') {
              console.log('Client pressed 1 → bridging to media specialist', partnerNumber, 'for job', clientJob.id);
              return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${defaultCallerId}" answerOnBridge="true" timeout="45">
    <Number>${partnerNumber}</Number>
  </Dial>
</Response>`);
            }

            const appDomain = Deno.env.get('BASE44_APP_DOMAIN') || '';
            const actionUrl = appDomain ? `${appDomain}/functions/twilioVoiceHandler?menu=1` : '';

            if (menu === '1') {
              console.log('Client menu → routing to support (digit:', digits, ')');
            } else {
              console.log('Client inbound → presenting IVR menu for job', clientJob.id);
              return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="${actionUrl}" method="POST" timeout="8" finishOnKey="">
    <Say voice="Polly.Joanna">To reach your media specialist, press 1. To reach support, press 2.</Say>
  </Gather>
  <Say voice="Polly.Joanna">Connecting you to support.</Say>
</Response>`);
            }
          }
        } catch (e) {
          console.error('Client IVR lookup failed:', e.message);
        }
      }

      let activeMembers = [];
      try {
        activeMembers = await base44.asServiceRole.entities.SalesTeamMember.filter({ is_active: true });
        console.log('Active members found:', activeMembers.length);
      } catch (e) {
        console.error('Failed to fetch members:', e.message);
      }

      if (activeMembers.length === 0) {
        return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>No sales representatives are available. Please try again later.</Say>
</Response>`);
      }

      const appDomain = Deno.env.get('BASE44_APP_DOMAIN') || '';
      const missedCallbackUrl = appDomain ? `${appDomain}/functions/handleMissedCall` : '';

      // Ring all browser dialers simultaneously first (20s timeout)
      // If nobody answers, fall back to all cell phones
      let clientTags = '';
      let cellTags = '';
      for (const member of activeMembers) {
        const identity = `sales_rep_${member.id.replace(/-/g, '_')}`;
        console.log('Adding client:', identity, 'cell fallback:', member.phone_number);
        clientTags += `<Client>${identity}</Client>`;
        if (member.phone_number) {
          const cellNumber = member.phone_number.startsWith('+') ? member.phone_number : '+1' + member.phone_number.replace(/\D/g, '');
          cellTags += `<Number>${cellNumber}</Number>`;
        }
      }

      // Try browser dialers first, then cell phones as fallback
      let twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${defaultCallerId}" timeout="20" action="${missedCallbackUrl}" method="POST">
    ${clientTags}
  </Dial>`;

      if (cellTags) {
        twiml += `
  <Dial callerId="${defaultCallerId}" timeout="30" action="${missedCallbackUrl}" method="POST">
    ${cellTags}
  </Dial>`;
      }

      twiml += `\n</Response>`;

      return xmlResponse(twiml);
    }

  } catch (error) {
    console.error('FATAL:', error.message, error.stack);
    return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>A system error occurred.</Say></Response>`);
  }
});