import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const body = await req.text();
    const params = new URLSearchParams(body);
    
    const to = params.get('To');
    const from = params.get('From');
    const callSid = params.get('CallSid');
    
    console.log('TwiML Handler received:', { to, from, callSid, isIncoming: !to && from });
    
    // Incoming call: to is the app's phone number, from is the caller
    if (!to || (to && !to.startsWith('+'))) {
      const incomingCallerPhone = from;
      console.log('Incoming call from:', incomingCallerPhone);
      
      // Just accept the call - Twilio will route it to the registered device
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Accept />
</Response>`;
      return new Response(twiml, {
        status: 200,
        headers: { 'Content-Type': 'application/xml; charset=utf-8' }
      });
    }
    
    // Outgoing call: to is the destination number
    let callerId = Deno.env.get('TWILIO_CALLING_PHONE_NUMBER');

    if (!callerId) {
      console.error('TWILIO_CALLING_PHONE_NUMBER not set in secrets');
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Configuration error. Please contact support.</Say>
</Response>`;
      return new Response(twiml, {
        status: 200,
        headers: { 'Content-Type': 'application/xml; charset=utf-8' }
      });
    }
    
    // Extract salesMemberId from token identity (format: sales_rep_xxx)
    if (from && from.startsWith('sales_rep_')) {
      const salesMemberId = from.replace('sales_rep_', '').replace(/_/g, '-');
      
      try {
        const base44 = createClientFromRequest(req);
        const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: salesMemberId });
        const member = members[0];
        if (member && member.twilio_phone_number) {
          callerId = member.twilio_phone_number;
        }
      } catch (err) {
        console.error('Failed to look up sales member:', err);
        // Fall through to default callerId
      }
    }

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${callerId}">
    <Number>${to}</Number>
  </Dial>
</Response>`;

    return new Response(twiml, {
      status: 200,
      headers: { 'Content-Type': 'application/xml; charset=utf-8' }
    });
  } catch (error) {
    console.error('Error in twilioVoiceHandler:', error);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>An error occurred. Please try again.</Say>
</Response>`;
    return new Response(twiml, {
      status: 200,
      headers: { 'Content-Type': 'application/xml; charset=utf-8' }
    });
  }
});