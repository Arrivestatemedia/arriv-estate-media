import twilio from 'npm:twilio@5.3.3';

Deno.serve(async (req) => {
  try {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twimlAppSid = Deno.env.get('TWILIO_TWIML_APP_SID');
    const appDomain = Deno.env.get('BASE44_APP_DOMAIN');

    if (!accountSid || !authToken || !twimlAppSid || !appDomain) {
      return Response.json({ 
        error: 'Missing required environment variables',
        needed: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_TWIML_APP_SID', 'BASE44_APP_DOMAIN']
      }, { status: 500 });
    }

    const client = twilio(accountSid, authToken);
    const cleanDomain = appDomain.replace(/^https?:\/\//, '');
    const voiceUrl = `https://${cleanDomain}/api/functions/twilioVoiceHandler`;

    const app = await client.api.accounts(accountSid).applications(twimlAppSid).update({
      voiceUrl: voiceUrl,
      voiceMethod: 'POST'
    });

    return Response.json({
      success: true,
      message: 'TwiML app configured',
      voiceUrl: voiceUrl,
      appSid: twimlAppSid
    });
  } catch (error) {
    console.error('Configure Twilio error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});