import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { transferId, recipientMemberId, senderMemberId, originalCallerPhone, callerName } = await req.json();

    if (!transferId || !recipientMemberId || !senderMemberId || !originalCallerPhone) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get sender's Twilio phone number
    const sender = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: senderMemberId });
    const senderPhone = sender?.[0]?.twilio_phone_number;
    if (!senderPhone) {
      return Response.json({ error: 'Sender has no Twilio number' }, { status: 400 });
    }

    // Get recipient's Twilio phone number
    const recipient = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: recipientMemberId });
    const recipientPhone = recipient?.[0]?.twilio_phone_number;
    if (!recipientPhone) {
      return Response.json({ error: 'Recipient has no Twilio number' }, { status: 400 });
    }

    // Initiate call to sender using Twilio SDK
    const twilio = await import('npm:twilio@4.10.0').then(m => m.default);
    const client = twilio(
      Deno.env.get('TWILIO_ACCOUNT_SID'),
      Deno.env.get('TWILIO_AUTH_TOKEN')
    );

    const baseUrl = Deno.env.get('BASE44_APP_DOMAIN') || 'https://arriv.app';
    const twimlUrl = `${baseUrl}/api/conferenceTwiml?transferId=${transferId}&originalCaller=${encodeURIComponent(originalCallerPhone)}&senderPhone=${encodeURIComponent(senderPhone)}&recipientPhone=${encodeURIComponent(recipientPhone)}`;

    const call = await client.calls.create({
      to: senderPhone,
      from: Deno.env.get('TWILIO_CALLING_PHONE_NUMBER'),
      url: twimlUrl,
      statusCallback: `${baseUrl}/api/transferStatusCallback?transferId=${transferId}`,
      statusCallbackMethod: 'POST'
    });

    console.log('Initiated transfer call to sender:', call.sid);

    return Response.json({ 
      success: true, 
      transferId, 
      callSid: call.sid
    });
  } catch (error) {
    console.error('Accept transfer error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});