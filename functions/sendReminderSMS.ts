import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { phone, message, recipientType, jobId, salesMemberId } = body;

    if (!phone || !message) {
      return Response.json({ error: 'Phone and message are required' }, { status: 400 });
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    let fromPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

    // Use sales rep's assigned number if provided
    if (salesMemberId) {
      const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: salesMemberId });
      const member = members[0];
      if (member && member.twilio_phone_number) {
        fromPhone = member.twilio_phone_number;
      }
    }

    // Format phone number with country code if not already present
    const formattedPhone = phone.startsWith('+') ? phone : `+1${phone}`;

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: fromPhone,
        To: formattedPhone,
        Body: message,
      }).toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Twilio error:', error);
      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'sms',
        recipient_type: recipientType || 'media_partner',
        recipient_phone: phone,
        message_content: message,
        job_id: jobId,
        status: 'failed',
        error_message: error
      });
      return Response.json({ error: 'Failed to send SMS' }, { status: 500 });
    }

    const result = await response.json();
    await base44.asServiceRole.entities.MessageLog.create({
      message_type: 'sms',
      recipient_type: recipientType || 'media_partner',
      recipient_phone: phone,
      message_content: message,
      job_id: jobId,
      status: 'success'
    });
    return Response.json({ success: true, messageId: result.sid });
  } catch (error) {
    console.error('Error sending SMS:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});