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
    let to, from;
    try {
      if (body.trim().startsWith('{')) {
        const json = JSON.parse(body);
        to = json.To;
        from = json.From;
      } else {
        const params = new URLSearchParams(body);
        to = params.get('To');
        from = params.get('From');
      }
    } catch (_) {
      const params = new URLSearchParams(body);
      to = params.get('To');
      from = params.get('From');
    }

    console.log('to:', to, 'from:', from);

    if (!to) {
      return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>No destination provided.</Say></Response>`);
    }

    const callerId = Deno.env.get('TWILIO_CALLING_PHONE_NUMBER') || Deno.env.get('TWILIO_PHONE_NUMBER');
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');

    // Detect outbound call: From is a Twilio client identity like "client:sales_rep_xxx"
    const isOutbound = from?.startsWith('client:');

    if (isOutbound) {
      const dest = to.trim().startsWith('+') ? to.trim() : '+1' + to.replace(/\D/g, '');
      console.log('Outbound → dialing:', dest, 'callerId:', callerId);

      return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${callerId}" answerOnBridge="true" timeout="30">
    <Number>${dest}</Number>
  </Dial>
</Response>`);

    } else {
      // Inbound call — route to all active sales reps via Twilio Client
      console.log('Inbound from:', from, 'to:', to);

      const base44 = createClientFromRequest(req);
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

      let clientTags = '';
      for (const member of activeMembers) {
        const identity = `sales_rep_${member.id.replace(/-/g, '_')}`;
        console.log('Adding client:', identity);
        clientTags += `<Client>${identity}</Client>`;
      }

      const appDomain = Deno.env.get('BASE44_APP_DOMAIN') || '';
      const missedCallbackUrl = appDomain ? `${appDomain}/functions/handleMissedCall` : '';

      return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${callerId}" timeout="30" action="${missedCallbackUrl}" method="POST">
    ${clientTags}
  </Dial>
</Response>`);
    }

  } catch (error) {
    console.error('FATAL:', error.message, error.stack);
    return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>A system error occurred.</Say></Response>`);
  }
});