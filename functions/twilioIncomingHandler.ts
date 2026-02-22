import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.text();
    const params = new URLSearchParams(body);
    
    const from = params.get('From');
    const to = params.get('To');
    
    // Get the sales rep's phone number from Twilio number
    const salesMembers = await base44.asServiceRole.entities.SalesTeamMember.filter({ twilio_phone_number: to });
    const salesMemberPhone = salesMembers.length > 0 ? salesMembers[0].phone_number : Deno.env.get('BRADLEY_PHONE');
    
    // TwiML to handle incoming call
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">You have an incoming call. Please hold while we connect you.</Say>
  <Dial>${salesMemberPhone}</Dial>
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