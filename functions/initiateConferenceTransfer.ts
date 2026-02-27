import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const twilio = await import('npm:twilio@4.10.0');

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { originalCallerPhone, recipientPhone, senderPhone, transferId } = await req.json();

    if (!originalCallerPhone || !recipientPhone || !senderPhone || !transferId) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const callingPhoneNumber = Deno.env.get('TWILIO_CALLING_PHONE_NUMBER');

    const client = twilio.default(accountSid, authToken);

    // TwiML that puts recipient in conference and bridges original caller
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference endConferenceOnExit="false">${transferId}</Conference>
  </Dial>
</Response>`;

    // Initiate call to recipient with TwiML
    const call = await client.calls.create({
      url: `${Deno.env.get('BASE44_APP_DOMAIN')}/functions/conferenceTwiml?transferId=${transferId}&originalCaller=${encodeURIComponent(originalCallerPhone)}&senderPhone=${encodeURIComponent(senderPhone)}`,
      to: recipientPhone,
      from: callingPhoneNumber,
      statusCallback: `${Deno.env.get('BASE44_APP_DOMAIN')}/functions/transferStatusCallback`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
    });

    console.log('Conference transfer initiated:', { transferId, recipientPhone, callSid: call.sid });

    return Response.json({ success: true, transferId, callSid: call.sid });
  } catch (error) {
    console.error('Conference transfer error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});