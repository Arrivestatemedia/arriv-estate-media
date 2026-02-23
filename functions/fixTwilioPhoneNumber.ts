Deno.serve(async (req) => {
  try {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twimlAppSid = Deno.env.get('TWILIO_TWIML_APP_SID');

    const auth = btoa(`${accountSid}:${authToken}`);

    // Get all phone numbers to find the SID for the 855 number
    const listRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json`,
      { headers: { 'Authorization': `Basic ${auth}` } }
    );
    const listData = await listRes.json();
    const numbers = listData.incoming_phone_numbers || [];

    const results = [];

    for (const num of numbers) {
      // Update ALL numbers to use the TwiML app SID
      const updateRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers/${num.sid}.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            VoiceApplicationSid: twimlAppSid,
            VoiceUrl: '',  // Clear direct voice URL since we're using TwiML app
          }).toString()
        }
      );
      const updateData = await updateRes.json();
      results.push({
        number: num.phone_number,
        sid: num.sid,
        success: updateRes.ok,
        voiceApplicationSid: updateData.voice_application_sid,
        voiceUrl: updateData.voice_url
      });
    }

    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});