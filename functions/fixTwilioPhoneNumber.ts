Deno.serve(async (req) => {
  try {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');

    const auth = btoa(`${accountSid}:${authToken}`);

    // Revert +18557654306 (PN6ad91dacf0e1eb941c9cf2706201f7be) back to its original demo voice URL
    const revertRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers/PN6ad91dacf0e1eb941c9cf2706201f7be.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          VoiceApplicationSid: '',
          VoiceUrl: 'https://demo.twilio.com/welcome/voice/',
          VoiceMethod: 'POST'
        }).toString()
      }
    );
    const revertData = await revertRes.json();

    return Response.json({
      reverted: {
        number: '+18557654306',
        success: revertRes.ok,
        voiceApplicationSid: revertData.voice_application_sid,
        voiceUrl: revertData.voice_url
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});