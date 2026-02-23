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
    const cleanDomain = appDomain.replace(/^https?:\/\//, '');
    const voiceUrl = `https://${cleanDomain}/api/functions/invoke/twilioVoiceHandler`;
    
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

    return Response.json({
      success: true,
      message: 'Twilio webhook configured',
      voiceUrl,
      appSid: twimlAppSid
    });

  } catch (error) {
    console.error('Setup Twilio webhook error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});