Deno.serve(async (req) => {
  try {
    const body = await req.text();
    const params = new URLSearchParams(body);
    
    const to = params.get('To');
    
    // Validate phone number format (allow E.164 or 10-digit US)
    if (!to) {
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>No phone number provided.</Say>
</Response>`;
      return new Response(twiml, {
        status: 200,
        headers: { 'Content-Type': 'application/xml; charset=utf-8' }
      });
    }
    
    // Get caller ID from custom param passed via Twilio
    let callerId = params.get('callerId') || Deno.env.get('TWILIO_PHONE_NUMBER');

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