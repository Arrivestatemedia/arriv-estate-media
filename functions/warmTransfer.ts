import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { senderCallSid, recipientCallSid, externalCallerNumber, senderNumber } = await req.json();

    if (!senderCallSid || !recipientCallSid) {
      return Response.json({ 
        error: 'Missing required fields',
        required: ['senderCallSid', 'recipientCallSid']
      }, { status: 400 });
    }

    const twilio = await import('npm:twilio@4.10.0').then(m => m.default);
    const client = twilio(
      Deno.env.get('TWILIO_ACCOUNT_SID'),
      Deno.env.get('TWILIO_AUTH_TOKEN')
    );

    const conferenceId = `conf-${Date.now()}`;
    console.log('Creating 3-way conference:', {
      senderCallSid,
      recipientCallSid,
      conferenceId
    });

    // Merge both calls into the same conference
    const callControlUrl = (sid) => `https://calls.twilio.com/v1/Calls/${sid}`;
    
    // Put sender into conference
    await fetch(callControlUrl(senderCallSid), {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${Deno.env.get('TWILIO_ACCOUNT_SID')}:${Deno.env.get('TWILIO_AUTH_TOKEN')}`),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `Twiml=${encodeURIComponent(`<Response><Dial><Conference>${conferenceId}</Conference></Dial></Response>`)}`
    });
    console.log('Sender connected to conference');

    // Put recipient into the same conference
    await fetch(callControlUrl(recipientCallSid), {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${Deno.env.get('TWILIO_ACCOUNT_SID')}:${Deno.env.get('TWILIO_AUTH_TOKEN')}`),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `Twiml=${encodeURIComponent(`<Response><Dial><Conference>${conferenceId}</Conference></Dial></Response>`)}`
    });
    console.log('Recipient connected to conference');

    return Response.json({
      success: true,
      conferenceId,
      message: 'All parties bridged into 3-way conference'
    });

  } catch (error) {
    console.error('3-way conference error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});