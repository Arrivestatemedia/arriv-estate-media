import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.text();
    const params = new URLSearchParams(body);
    
    const to = params.get('To');
    const salesMemberId = params.get('salesMemberId');
    
    let callerId = Deno.env.get('TWILIO_PHONE_NUMBER');
    
    // If this is from a sales rep, use their specific phone number
    if (salesMemberId) {
      try {
        const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: salesMemberId });
        if (members.length > 0 && members[0].twilio_phone_number) {
          callerId = members[0].twilio_phone_number;
        }
      } catch (err) {
        console.error('Failed to lookup sales member:', err);
      }
    }

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${callerId}">
    <Number>${to}</Number>
  </Dial>
</Response>`;

    return new Response(twiml, {
      headers: { 'Content-Type': 'text/xml' }
    });
  } catch (error) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>An error occurred. Please try again.</Say>
</Response>`;
    return new Response(twiml, {
      headers: { 'Content-Type': 'text/xml' }
    });
  }
});