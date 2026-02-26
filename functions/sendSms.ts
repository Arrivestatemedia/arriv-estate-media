import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { conversationId, toNumber, body, salesMemberId, newConversation } = await req.json();

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    let fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    // Use sales rep's assigned number if provided
    if (salesMemberId) {
      const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: salesMemberId });
      const member = members[0];
      if (member && member.twilio_phone_number) {
        fromNumber = member.twilio_phone_number;
      }
    }

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

    let convoId = conversationId;

    // If new conversation, find or create it
    if (newConversation) {
      const existing = await base44.asServiceRole.entities.SmsConversation.filter({ from_number: toNumber });
      if (existing && existing.length > 0) {
        convoId = existing[0].id;
      } else {
        const newConvo = await base44.asServiceRole.entities.SmsConversation.create({
          from_number: toNumber,
          last_message: body,
          last_message_at: new Date().toISOString(),
          unread_count: 0,
          sales_member_id: salesMemberId
        });
        convoId = newConvo.id;
      }
    }

    // Store outbound message
    await base44.asServiceRole.entities.SmsMessage.create({
      conversation_id: convoId,
      from_number: fromNumber,
      to_number: toNumber,
      body: body,
      direction: 'outbound',
      twilio_sid: result.sid
    });

    // Update conversation last message
    await base44.asServiceRole.entities.SmsConversation.update(convoId, {
      last_message: body,
      last_message_at: new Date().toISOString()
    });

    return Response.json({ success: true, sid: result.sid });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});