Deno.serve(async (req) => {
  try {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const phoneNumber = Deno.env.get('TWILIO_CALLING_PHONE_NUMBER') || Deno.env.get('TWILIO_PHONE_NUMBER');

    const auth = btoa(`${accountSid}:${authToken}`);

    // List all phone numbers
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json`,
      { headers: { 'Authorization': `Basic ${auth}` } }
    );
    const data = await res.json();

    const numbers = data.incoming_phone_numbers?.map(n => ({
      number: n.phone_number,
      friendly: n.friendly_name,
      voiceUrl: n.voice_url,
      voiceMethod: n.voice_method,
      voiceApplicationSid: n.voice_application_sid
    }));

    return Response.json({ numbers });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});