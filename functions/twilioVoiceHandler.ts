import twilio from 'npm:twilio@5.3.3';

Deno.serve(async (req) => {
  const errorTwiml = (msg) => new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${msg}</Say></Response>`,
    { status: 200, headers: { 'Content-Type': 'text/xml' } }
  );

  try {
    const body = await req.text();
    console.log('RAW BODY:', body);
    console.log('Content-Type:', req.headers.get('content-type'));

    const params = new URLSearchParams(body);
    const allParams = {};
    for (const [k, v] of params.entries()) allParams[k] = v;
    console.log('Parsed params:', JSON.stringify(allParams));

    const to = params.get('To');
    const from = params.get('From');

    console.log('to:', to, 'from:', from);

    if (!to) {
      console.error('No To param found');
      return errorTwiml('No destination provided.');
    }

    let callerId = Deno.env.get('TWILIO_CALLING_PHONE_NUMBER');
    if (!callerId) {
      console.error('TWILIO_CALLING_PHONE_NUMBER not set');
      return errorTwiml('Configuration error.');
    }

    // "client:sales_rep_xxx" means this is an outbound call from the browser dialer
    const fromIdentity = from?.startsWith('client:') ? from.slice(7) : from;
    const isOutboundFromDevice = !!fromIdentity?.startsWith('sales_rep_');

    console.log('isOutboundFromDevice:', isOutboundFromDevice, 'fromIdentity:', fromIdentity);

    let twiml;

    if (isOutboundFromDevice) {
      // Outbound: dial the number in To param
      let formattedNumber = to.trim();
      if (!formattedNumber.startsWith('+')) {
        formattedNumber = '+1' + formattedNumber.replace(/\D/g, '');
      }
      console.log('Outbound call, callerId:', callerId, 'to:', formattedNumber);

      // Try to get per-rep caller ID
      try {
        const salesMemberId = fromIdentity.replace('sales_rep_', '').replace(/_/g, '-');
        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const client = twilio(accountSid, authToken);
        // We can't easily query base44 without auth, so just use default callerId
        // unless per-rep number is needed — keep using env default for now
        console.log('Using callerId:', callerId, 'for salesMemberId:', salesMemberId);
      } catch (err) {
        console.error('Error in caller ID lookup:', err.message);
      }

      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${callerId}" answerOnBridge="true" timeout="30">
    <Number>${formattedNumber}</Number>
  </Dial>
</Response>`;

    } else {
      // Inbound: ring all active reps via Client
      console.log('Inbound call from:', from);

      try {
        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const client = twilio(accountSid, authToken);

        // Use Twilio REST API to list workers — but we don't have that.
        // Instead use Base44 service token directly via fetch
        const appId = Deno.env.get('BASE44_APP_ID');
        const serviceToken = Deno.env.get('BASE44_SERVICE_TOKEN');

        const membersRes = await fetch(`https://api.base44.com/api/apps/${appId}/entities/SalesTeamMember/query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': serviceToken
          },
          body: JSON.stringify({ filter: { is_active: true } })
        });

        if (!membersRes.ok) {
          throw new Error(`Base44 query failed: ${membersRes.status} ${await membersRes.text()}`);
        }

        const activeMembers = await membersRes.json();
        console.log('Active members count:', activeMembers.length);

        if (activeMembers.length === 0) {
          twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>No sales representatives are available. Please try again later.</Say>
</Response>`;
        } else {
          let dialXml = '<Dial timeout="30">';
          for (const member of activeMembers) {
            const identity = `sales_rep_${member.id.replace(/-/g, '_')}`;
            console.log('Routing inbound to identity:', identity);
            dialXml += `<Client>${identity}</Client>`;
          }
          dialXml += '</Dial>';
          twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${dialXml}
</Response>`;
        }
      } catch (err) {
        console.error('Inbound routing error:', err.message);
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We are unable to connect your call at this time. Please try again.</Say>
</Response>`;
      }
    }

    console.log('Returning TwiML:', twiml);
    return new Response(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' }
    });

  } catch (error) {
    console.error('FATAL error in twilioVoiceHandler:', error.message, error.stack);
    return errorTwiml('A system error occurred. Please try again.');
  }
});