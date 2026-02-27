import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { senderCallSid, externalCallerNumber, recipientExtension } = await req.json();

    if (!senderCallSid || !externalCallerNumber || !recipientExtension) {
      return Response.json({ 
        error: 'Missing required fields',
        required: ['senderCallSid', 'externalCallerNumber', 'recipientExtension']
      }, { status: 400 });
    }

    const twilio = await import('npm:twilio@4.10.0').then(m => m.default);
    const client = twilio(
      Deno.env.get('TWILIO_ACCOUNT_SID'),
      Deno.env.get('TWILIO_AUTH_TOKEN')
    );

    const conferenceId = `transfer-${Date.now()}`;
    console.log('Creating blind transfer:', {
      senderCallSid,
      externalCallerNumber,
      recipientExtension,
      conferenceId
    });

    // Step 1: Get sender's call to verify it exists and understand its state
    const senderCall = await client.calls(senderCallSid).fetch();
    console.log('Sender call state:', {
      status: senderCall.status,
      direction: senderCall.direction,
      from: senderCall.from,
      to: senderCall.to
    });

    // Step 2: Redirect sender into conference using Call Control API
    const callControlUrl = `https://calls.twilio.com/v1/Calls/${senderCallSid}`;
    await fetch(callControlUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${Deno.env.get('TWILIO_ACCOUNT_SID')}:${Deno.env.get('TWILIO_AUTH_TOKEN')}`),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `Twiml=${encodeURIComponent(`<Response><Dial><Conference>${conferenceId}</Conference></Dial></Response>`)}`
    });
    console.log('Redirected sender call into conference:', conferenceId);

    // Step 3: Look up recipient by extension
    const recipients = await base44.asServiceRole.entities.SalesTeamMember.filter({ extension: parseInt(recipientExtension) });
    if (!recipients || recipients.length === 0) {
      return Response.json({ error: `Extension ${recipientExtension} not found` }, { status: 404 });
    }
    const recipient = recipients[0];
    console.log('Recipient found:', recipient.full_name, recipient.id);

    // Step 4: Dial recipient into the same conference
    const mainNumber = Deno.env.get('TWILIO_CALLING_PHONE_NUMBER');
    const recipientPhoneNumber = recipient.phone_number;
    
    if (!recipientPhoneNumber) {
      return Response.json({ error: `Recipient (${recipient.full_name}) has no phone number on file` }, { status: 400 });
    }

    const recipientCall = await client.calls.create({
      from: mainNumber,
      to: recipientPhoneNumber,
      twiml: `<Response><Dial><Conference>${conferenceId}</Conference></Dial></Response>`
    });
    console.log('Recipient call initiated:', recipientCall.sid);

    // Step 5: After a short delay, disconnect sender from the conference
    // (This leaves the external caller + recipient connected in the conference)
    setTimeout(async () => {
      try {
        await client.calls(senderCallSid).update({
          twiml: `<Response><Hangup/></Response>`
        });
        console.log('Sender disconnected from conference');
      } catch (e) {
        console.error('Failed to disconnect sender:', e.message);
      }
    }, 1000);

    return Response.json({
      success: true,
      conferenceId,
      senderCallSid,
      recipientCallSid: recipientCall.sid,
      message: 'Blind transfer initiated. External caller bridged with recipient.'
    });

  } catch (error) {
    console.error('Blind transfer error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});