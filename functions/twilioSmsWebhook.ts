import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const body = await req.text();
    const params = new URLSearchParams(body);

    const from = params.get('From');
    const to = params.get('To');
    const messageBody = params.get('Body');
    const twilioSid = params.get('MessageSid');

    const base44 = createClientFromRequest(req);

    // Find the sales rep who owns this Twilio number
    const reps = await base44.asServiceRole.entities.SalesTeamMember.filter({ twilio_phone_number: to });
    const salesMemberId = reps && reps.length > 0 ? reps[0].id : null;

    // Find or create a conversation for this number
    const existing = await base44.asServiceRole.entities.SmsConversation.filter({ from_number: from });
    let conversation;

    if (existing && existing.length > 0) {
      conversation = existing[0];
      // Update conversation with sales member if not already set
      const updateData = {
        last_message: messageBody,
        last_message_at: new Date().toISOString(),
        unread_count: (conversation.unread_count || 0) + 1
      };
      if (salesMemberId && !conversation.sales_member_id) {
        updateData.sales_member_id = salesMemberId;
      }
      await base44.asServiceRole.entities.SmsConversation.update(conversation.id, updateData);
    } else {
      conversation = await base44.asServiceRole.entities.SmsConversation.create({
        from_number: from,
        last_message: messageBody,
        last_message_at: new Date().toISOString(),
        unread_count: 1,
        sales_member_id: salesMemberId
      });
    }

    // Store the message
    await base44.asServiceRole.entities.SmsMessage.create({
      conversation_id: conversation.id,
      from_number: from,
      to_number: to,
      body: messageBody,
      direction: 'inbound',
      twilio_sid: twilioSid
    });

    // Return empty TwiML (no auto-reply)
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
      headers: { 'Content-Type': 'text/xml' }
    });
  } catch (error) {
    console.error('SMS webhook error:', error);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
      headers: { 'Content-Type': 'text/xml' }
    });
  }
});