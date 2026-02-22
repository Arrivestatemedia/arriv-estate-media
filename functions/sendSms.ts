import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { conversationId, toNumber, body } = await req.json();

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    const formData = new URLSearchParams({
      From: fromNumber,
      To: toNumber,
      Body: body
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString()
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Failed to send SMS');
    }

    // Store outbound message
    await base44.asServiceRole.entities.SmsMessage.create({
      conversation_id: conversationId,
      from_number: fromNumber,
      to_number: toNumber,
      body: body,
      direction: 'outbound',
      twilio_sid: result.sid
    });

    // Update conversation last message
    await base44.asServiceRole.entities.SmsConversation.update(conversationId, {
      last_message: body,
      last_message_at: new Date().toISOString()
    });

    return Response.json({ success: true, sid: result.sid });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});