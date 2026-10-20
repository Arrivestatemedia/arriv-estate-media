import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    // Only admins can configure Twilio
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twimlAppSid = Deno.env.get('TWILIO_TWIML_APP_SID');
    const appDomain = Deno.env.get('BASE44_APP_DOMAIN');

    if (!accountSid || !authToken || !twimlAppSid || !appDomain) {
      return Response.json({ error: 'Missing Twilio configuration' }, { status: 400 });
    }

    // Build the webhook URL for voice calls
    const voiceUrl = `https://${appDomain}/api/functions/twilioVoiceHandler`;
    
    console.log('Configuring Twilio App:', {
      twimlAppSid,
      voiceUrl
    });

    // Update TwiML App with voice URL
    const auth = btoa(`${accountSid}:${authToken}`);
    const updateRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Applications/${twimlAppSid}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          VoiceUrl: voiceUrl,
          VoiceMethod: 'POST'
        }).toString()
      }
    );

    if (!updateRes.ok) {
      const errorText = await updateRes.text();
      console.error('Twilio update error:', updateRes.status, errorText);
      return Response.json({ 
        error: 'Failed to update Twilio app', 
        details: errorText 
      }, { status: 500 });
    }

    const data = await updateRes.json();
    console.log('Twilio App updated successfully');

    // ── Wire the voice status callback onto the company number ──
    // So the owner gets a text on every answered / missed call (handleMissedCall).
    const statusCallbackUrl = `https://${appDomain}/functions/handleMissedCall`;
    const companyNumber = Deno.env.get('TWILIO_CALLING_PHONE_NUMBER') || Deno.env.get('TWILIO_PHONE_NUMBER');
    let statusCallbackResult = { configured: false };

    if (companyNumber) {
      try {
        const lookupRes = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(companyNumber)}`,
          { headers: { Authorization: `Basic ${auth}` } }
        );
        if (lookupRes.ok) {
          const lookupData = await lookupRes.json();
          const pn = lookupData?.incoming_phone_numbers?.[0];
          if (pn?.sid) {
            const updateNumRes = await fetch(
              `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers/${pn.sid}.json`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Basic ${auth}`,
                  'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                  StatusCallbackUrl: statusCallbackUrl,
                  StatusCallbackMethod: 'POST'
                }).toString()
              }
            );
            statusCallbackResult = {
              configured: updateNumRes.ok,
              status: updateNumRes.status,
              url: statusCallbackUrl
            };
            if (!updateNumRes.ok) {
              console.error('Status callback update failed:', updateNumRes.status, (await updateNumRes.text()).slice(0, 200));
            }
          }
        }
      } catch (e) {
        console.error('Status callback setup error:', e.message);
        statusCallbackResult = { configured: false, error: e.message };
      }
    }

    return Response.json({
      success: true,
      message: 'Twilio webhook configured',
      voiceUrl,
      appSid: twimlAppSid,
      statusCallback: statusCallbackResult
    });

  } catch (error) {
    console.error('Setup Twilio webhook error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});