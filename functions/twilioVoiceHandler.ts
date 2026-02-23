import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const body = await req.text();
    const params = new URLSearchParams(body);

    // When a sales rep makes an outbound call via device.connect({ params: { To: number } }),
    // Twilio posts: To=<TwiML App SID>, From=client:<identity>, and the custom param as "To" only in params
    // The custom params are posted with their exact key names
    const to = params.get('To');
    const from = params.get('From');

    // Log everything for debugging
    const allParams = {};
    for (const [k, v] of params.entries()) allParams[k] = v;
    console.log('TwiML Handler params:', JSON.stringify(allParams));

    if (!to) {
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>No destination provided.</Say></Response>`, {
        status: 200,
        headers: { 'Content-Type': 'application/xml; charset=utf-8' }
      });
    }

    let callerId = Deno.env.get('TWILIO_CALLING_PHONE_NUMBER');

    if (!callerId) {
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>Configuration error.</Say></Response>`, {
        status: 200,
        headers: { 'Content-Type': 'application/xml; charset=utf-8' }
      });
    }

    // Extract identity from "client:sales_rep_xxx" format
    const fromIdentity = from?.startsWith('client:') ? from.slice(7) : from;
    const isOutboundFromDevice = fromIdentity?.startsWith('sales_rep_');

    console.log('isOutboundFromDevice:', isOutboundFromDevice, 'to:', to, 'fromIdentity:', fromIdentity);

    let twiml;

    if (isOutboundFromDevice) {
      // Outbound call: look up caller ID for this sales rep
      const salesMemberId = fromIdentity.replace('sales_rep_', '').replace(/_/g, '-');
      try {
        const base44 = createClientFromRequest(req);
        const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: salesMemberId });
        const member = members[0];
        if (member?.twilio_phone_number) {
          callerId = member.twilio_phone_number;
        }
      } catch (err) {
        console.error('Failed to look up sales member:', err);
      }

      // Format the destination number
      let formattedNumber = to.trim();
      // If "To" is the TwiML App SID (starts with "AP"), the real number wasn't passed — shouldn't happen
      // but guard anyway
      if (!formattedNumber.startsWith('+') && !formattedNumber.startsWith('AP')) {
        formattedNumber = '+1' + formattedNumber.replace(/\D/g, '');
      }

      console.log('Outbound call from', callerId, 'to', formattedNumber);

      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${callerId}" answerOnBridge="true" timeout="30">
    <Number>${formattedNumber}</Number>
  </Dial>
</Response>`;
    } else {
      // Inbound call from external number — ring all active sales reps
      console.log('Inbound call from', from, 'routing to active reps');
      try {
        const base44 = createClientFromRequest(req);
        const activeMembers = await base44.asServiceRole.entities.SalesTeamMember.filter({ is_active: true });

        if (activeMembers.length === 0) {
          twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>No sales representatives are available. Please try again later.</Say>
</Response>`;
        } else {
          let dialXml = '<Dial timeout="30">';
          for (const member of activeMembers) {
            dialXml += `<Client>${member.id}</Client>`;
          }
          dialXml += '</Dial>';
          twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${dialXml}
</Response>`;
        }
      } catch (err) {
        console.error('Failed to route inbound call:', err);
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>An error occurred routing your call.</Say>
</Response>`;
      }
    }

    return new Response(twiml, {
      status: 200,
      headers: { 'Content-Type': 'application/xml; charset=utf-8' }
    });
  } catch (error) {
    console.error('Error in twilioVoiceHandler:', error);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>An error occurred.</Say></Response>`, {
      status: 200,
      headers: { 'Content-Type': 'application/xml; charset=utf-8' }
    });
  }
});