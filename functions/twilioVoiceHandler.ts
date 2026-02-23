import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const xmlResponse = (twiml) => new Response(twiml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' }
  });

  try {
    const contentType = req.headers.get('content-type') || '';
    const body = await req.text();
    console.log('Content-Type:', contentType);
    console.log('RAW BODY:', body);

    let to, from;
    if (body.trim().startsWith('{')) {
      try {
        const json = JSON.parse(body);
        to = json.To;
        from = json.From;
      } catch (_) {}
    }
    if (!to) {
      const params = new URLSearchParams(body);
      to = params.get('To');
      from = params.get('From');
      const all = {};
      for (const [k, v] of params.entries()) all[k] = v;
      console.log('Form params:', JSON.stringify(all));
    }

    console.log('to:', to, 'from:', from);

    if (!to) {
      console.error('No To param');
      return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>No destination provided.</Say></Response>`);
    }

    const callerId = Deno.env.get('TWILIO_CALLING_PHONE_NUMBER');
    if (!callerId) {
      console.error('TWILIO_CALLING_PHONE_NUMBER not set');
      return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>Configuration error.</Say></Response>`);
    }

    // Detect outbound: From = "client:sales_rep_xxx"
    const fromIdentity = from?.startsWith('client:') ? from.slice(7) : from;
    const isOutbound = !!fromIdentity?.startsWith('sales_rep_');
    console.log('isOutbound:', isOutbound, 'fromIdentity:', fromIdentity, 'callerId:', callerId);

    if (isOutbound) {
      let dest = to.trim();
      if (!dest.startsWith('+')) {
        dest = '+1' + dest.replace(/\D/g, '');
      }
      console.log('Outbound → dialing:', dest, 'with callerId:', callerId);

      return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${callerId}" answerOnBridge="true" timeout="30">
    <Number>${dest}</Number>
  </Dial>
</Response>`);

    } else {
      // Inbound — route to active sales reps
      console.log('Inbound from:', from);

      // Use asServiceRole — works even without a user token for webhooks
      const base44 = createClientFromRequest(req);
      const activeMembers = await base44.asServiceRole.entities.SalesTeamMember.filter({ is_active: true });

      console.log('Active members:', activeMembers.length);

      if (activeMembers.length === 0) {
        return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>No sales representatives are available. Please try again later.</Say>
</Response>`);
      }

      let dialXml = '<Dial timeout="30">';
      for (const member of activeMembers) {
        const identity = `sales_rep_${member.id.replace(/-/g, '_')}`;
        console.log('Routing to:', identity);
        dialXml += `<Client>${identity}</Client>`;
      }
      dialXml += '</Dial>';

      return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${dialXml}
</Response>`);
    }

  } catch (error) {
    console.error('FATAL:', error.message, error.stack);
    return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>A system error occurred.</Say></Response>`);
  }
});