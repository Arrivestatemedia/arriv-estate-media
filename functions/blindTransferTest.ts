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

    console.log('Creating blind transfer:', { senderCallSid, externalCallerNumber, recipientExtension, conferenceId });

    // Step 1: Fetch sender's call to verify it exists
    const senderCall = await client.calls(senderCallSid).fetch();
    console.log('Sender call state:', { status: senderCall.status, direction: senderCall.direction, from: senderCall.from, to: senderCall.to });

    if (senderCall.status !== 'in-progress') {
      return Response.json({ error: `Sender call is not active (status: ${senderCall.status})` }, { status: 400 });
    }

    // Step 2: Find the external caller's leg (inbound call from the PSTN)
    // The external caller called in and Twilio created a call leg for them.
    // We search for an in-progress inbound call from that number.
    let externalCallSid = null;
    try {
      const normalizedNumber = externalCallerNumber.startsWith('+') ? externalCallerNumber : '+1' + externalCallerNumber.replace(/\D/g, '');
      const inboundCalls = await client.calls.list({ from: normalizedNumber, status: 'in-progress' });
      console.log(`Found ${inboundCalls.length} inbound calls from ${normalizedNumber}`);
      if (inboundCalls.length > 0) {
        externalCallSid = inboundCalls[0].sid;
        console.log('External caller leg SID:', externalCallSid);
      }
    } catch (e) {
      console.warn('Could not find inbound external call leg:', e.message);
    }

    // Step 3: Look up recipient by extension
    const recipients = await base44.asServiceRole.entities.SalesTeamMember.filter({ extension: parseInt(recipientExtension) });
    if (!recipients || recipients.length === 0) {
      return Response.json({ error: `Extension ${recipientExtension} not found` }, { status: 404 });
    }
    const recipient = recipients[0];
    const recipientPhoneNumber = recipient.phone_number;
    if (!recipientPhoneNumber) {
      return Response.json({ error: `Recipient (${recipient.full_name}) has no phone number on file` }, { status: 400 });
    }
    console.log('Recipient found:', recipient.full_name, recipientPhoneNumber);

    const mainNumber = Deno.env.get('TWILIO_CALLING_PHONE_NUMBER');

    if (externalCallSid) {
      // ── IDEAL PATH: We found the external caller's leg ──────────────────────
      // 1. Move external caller into conference (they hear hold music briefly)
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${externalCallSid}.json`, {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `Twiml=${encodeURIComponent(`<Response><Dial><Conference waitUrl="https://twimlets.com/holdmusic?Bucket=com.twilio.music.classical" beep="false">${conferenceId}</Conference></Dial></Response>`)}`
      });
      console.log('External caller moved into conference:', conferenceId);

      // 2. Hang up the agent's SDK leg cleanly (no music, no dead air)
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${senderCallSid}.json`, {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `Twiml=${encodeURIComponent('<Response><Hangup/></Response>')}`
      });
      console.log('Agent leg hung up cleanly');

    } else {
      // ── FALLBACK PATH: Move the agent's leg into conference ─────────────────
      // The external caller is already bridged through the agent's call,
      // so moving the agent's TwiML leg into a conference carries the external caller with it.
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${senderCallSid}.json`, {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `Twiml=${encodeURIComponent(`<Response><Dial><Conference waitUrl="https://twimlets.com/holdmusic?Bucket=com.twilio.music.classical" beep="false">${conferenceId}</Conference></Dial></Response>`)}`
      });
      console.log('Agent leg (carrying external caller) moved into conference:', conferenceId);
    }

    // Step 4: Dial recipient into the same conference
    const recipientCall = await client.calls.create({
      from: mainNumber,
      to: recipientPhoneNumber,
      twiml: `<Response><Say voice="alice">You have an incoming transfer. Connecting you now.</Say><Dial><Conference beep="false">${conferenceId}</Conference></Dial></Response>`
    });
    console.log('Recipient call initiated:', recipientCall.sid);

    // Step 5 (only for fallback path): Once recipient answers and joins, drop the agent from the conference
    // We do this by monitoring conference participants. For simplicity, we use a delayed hangup
    // only if we used the fallback path (agent leg is in the conference).
    if (!externalCallSid) {
      setTimeout(async () => {
        try {
          // Find the conference and remove the agent's participant
          const conferences = await client.conferences.list({ friendlyName: conferenceId, status: 'in-progress' });
          if (conferences.length > 0) {
            const conf = conferences[0];
            const participants = await client.conferences(conf.sid).participants.list();
            // The agent's leg is senderCallSid — kick them out
            const agentParticipant = participants.find(p => p.callSid === senderCallSid);
            if (agentParticipant) {
              await client.conferences(conf.sid).participants(senderCallSid).remove();
              console.log('Agent removed from conference, external caller and recipient remain connected');
            } else {
              console.log('Agent already left conference');
            }
          }
        } catch (e) {
          console.error('Failed to remove agent from conference:', e.message);
        }
      }, 8000); // Give recipient 8 seconds to answer before dropping agent
    }

    return Response.json({
      success: true,
      conferenceId,
      senderCallSid,
      recipientCallSid: recipientCall.sid,
      externalCallSid,
      path: externalCallSid ? 'ideal' : 'fallback',
      message: 'Blind transfer initiated. External caller will be connected with recipient.'
    });

  } catch (error) {
    console.error('Blind transfer error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});