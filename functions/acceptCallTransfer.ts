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

    // Redirect the original caller's call to the conference
    await client.calls(senderCallSid).update({
      twiml: `<Response><Dial><Conference>${transferId}</Conference></Dial></Response>`
    });
    console.log('Redirected caller to conference:', senderCallSid);

    // Dial the recipient to bridge them into the same conference
    const recipientCall = await client.calls.create({
      from: senderPhone,
      to: recipientPhone,
      twiml: `<Response><Dial><Conference>${transferId}</Conference></Dial></Response>`
    });
    console.log('Dialed recipient into conference:', recipientCall.sid);

    // Update transfer status
    await base44.asServiceRole.entities.PendingCallTransfer.update(transferId, { 
      conference_id: transferId,
      initiated_at: new Date().toISOString(),
      status: 'accepted'
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