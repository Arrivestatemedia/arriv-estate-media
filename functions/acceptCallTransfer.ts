import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { transferId, senderMemberId, originalCallerPhone, recipientPhone, senderCallSid } = await req.json();

    if (!transferId || !senderMemberId || !originalCallerPhone || !recipientPhone || !senderCallSid) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get sender's Twilio phone number
    const sender = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: senderMemberId });
    const senderPhone = sender?.[0]?.twilio_phone_number;
    if (!senderPhone) {
      return Response.json({ error: 'Sender has no Twilio number' }, { status: 400 });
    }

    const twilio = await import('npm:twilio@4.10.0').then(m => m.default);
    const client = twilio(
      Deno.env.get('TWILIO_ACCOUNT_SID'),
      Deno.env.get('TWILIO_AUTH_TOKEN')
    );

    const baseUrl = Deno.env.get('BASE44_APP_DOMAIN') || 'https://arriv.app';

    // Step 1: Use Call Control API to redirect sender's active call to the conference
    // This moves their existing call mid-stream without dropping it
    await client.calls(senderCallSid).update({
      twiml: `<Response><Dial><Conference>${transferId}</Conference></Dial></Response>`
    });

    console.log('Redirected sender call to conference via Call Control:', senderCallSid);

    // Step 2: Call the recipient — they can answer and join the same conference
    const recipientCall = await client.calls.create({
      to: recipientPhone,
      from: Deno.env.get('TWILIO_CALLING_PHONE_NUMBER'),
      url: `${baseUrl}/api/transferRecipientTwiml?transferId=${transferId}`,
      statusCallback: `${baseUrl}/api/transferStatusCallback?transferId=${transferId}`,
      statusCallbackMethod: 'POST'
    });

    console.log('Initiated call to recipient:', recipientCall.sid);

    await base44.asServiceRole.entities.PendingCallTransfer.update(transferId, { 
      twilio_call_sid: recipientCall.sid,
      initiated_at: new Date().toISOString()
    }).catch(() => {});

    return Response.json({ 
      success: true, 
      transferId, 
      callSid: recipientCall.sid
    });
  } catch (error) {
    console.error('Accept transfer error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});