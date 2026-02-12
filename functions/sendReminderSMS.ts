import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { phone, message } = body;

    if (!phone || !message) {
      return Response.json({ error: 'Phone and message are required' }, { status: 400 });
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: fromPhone,
        To: phone,
        Body: message,
      }).toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Twilio error:', error);
      return Response.json({ error: 'Failed to send SMS' }, { status: 500 });
    }

    const result = await response.json();
    return Response.json({ success: true, messageId: result.sid });
  } catch (error) {
    console.error('Error sending SMS:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});