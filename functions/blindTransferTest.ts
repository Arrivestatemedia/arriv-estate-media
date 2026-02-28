import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

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
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const authHeader = 'Basic ' + btoa(`${accountSid}:${authToken}`);

    console.log('Starting blind transfer:', { senderCallSid, externalCallerNumber, recipientExtension, conferenceId });

    // Step 1: Look up recipient by extension
    const recipients = await base44.asServiceRole.entities.SalesTeamMember.filter({ extension: parseInt(recipientExtension) });
    if (!recipients || recipients.length === 0) {
      return Response.json({ error: `Extension ${recipientExtension} not found` }, { status: 404 });
    }
    const recipient = recipients[0];
    console.log('Recipient found:', recipient.full_name, 'email:', recipient.email);

    // Build the recipient's Twilio Client identity — same format used in generateTwilioToken
    // Identity is based on email: strip non-alphanumeric chars
    const recipientIdentity = recipient.email.replace(/[^a-zA-Z0-9_\-]/g, '_');
    console.log('Recipient Twilio identity:', recipientIdentity);

    // Step 2: Redirect the SENDER's call into a conference (puts external caller on hold music)
    // The conference has startConferenceOnEnter=false for the sender, so external caller hears hold music
    // until the recipient joins.
    const holdConferenceTwiml = `<Response><Dial><Conference waitUrl="https://twimlets.com/holdmusic?Bucket=com.twilio.music.classical" startConferenceOnEnter="true" endConferenceOnExit="false">${conferenceId}</Conference></Dial></Response>`;

    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${senderCallSid}.json`, {
      method: 'POST',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `Twiml=${encodeURIComponent(holdConferenceTwiml)}`
    });
    console.log('Sender call redirected into conference (external caller now on hold)');

    // Step 3: Dial the RECIPIENT via their Twilio Client browser identity (NOT their phone)
    // This rings their browser dialer as an incoming call — no phone call involved.
    const recipientTwiml = `<Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true">${conferenceId}</Conference></Dial></Response>`;

    const recipientCall = await client.calls.create({
      from: Deno.env.get('TWILIO_CALLING_PHONE_NUMBER'),
      to: `client:${recipientIdentity}`,
      twiml: recipientTwiml
    });
    console.log('Recipient browser call initiated:', recipientCall.sid);

    // Step 4: After recipient answers and is bridged, disconnect sender from the conference
    // We wait 2 seconds to allow the conference to start before dropping the sender.
    setTimeout(async () => {
      try {
        const hangupTwiml = '<Response><Hangup/></Response>';
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${senderCallSid}.json`, {
          method: 'POST',
          headers: { 'Authorization': authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `Twiml=${encodeURIComponent(hangupTwiml)}`
        });
        console.log('Sender (transferring rep) disconnected from conference - external caller and recipient now connected');
      } catch (e) {
        console.error('Failed to disconnect sender:', e.message);
      }
    }, 2000);

    return Response.json({
      success: true,
      conferenceId,
      recipientName: recipient.full_name,
      recipientCallSid: recipientCall.sid,
      message: `Transfer initiated. ${recipient.full_name} is being rung on their browser. External caller is on hold.`
    });

  } catch (error) {
    console.error('Blind transfer error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});