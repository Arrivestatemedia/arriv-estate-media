import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const { phone_number, user_type, user_role } = await req.json();

        if (!phone_number || !user_type) {
            return Response.json({ 
                error: 'Phone number and user type are required' 
            }, { status: 400 });
        }

        if (!['client', 'media_partner'].includes(user_type)) {
            return Response.json({ 
                error: 'User type must be either "client" or "media_partner"' 
            }, { status: 400 });
        }

        const role = user_role || 'user';
        if (!['user', 'admin'].includes(role)) {
            return Response.json({ 
                error: 'User role must be either "user" or "admin"' 
            }, { status: 400 });
        }

        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

        if (!accountSid || !authToken || !twilioPhone) {
            return Response.json({ 
                error: 'Twilio credentials not configured' 
            }, { status: 500 });
        }

        let appDomain = Deno.env.get('BASE44_APP_DOMAIN') || 'app.arrivestatemedia.com';
        // Remove https:// if already present
        appDomain = appDomain.replace(/^https?:\/\//, '');
        const pageName = user_type === 'client' ? 'ClientSignup' : 'MediaPartnerSignup';
        const signupUrl = `https://${appDomain}/${pageName}?phone_number=${encodeURIComponent(phone_number)}&role=${encodeURIComponent(role)}`;

        const message = user_type === 'client' 
            ? `Welcome to Arriv Estate Media! Click here to complete your registration and book your shoot: ${signupUrl}`
            : `You've been invited to join Arriv Estate Media as a media partner! Click here to complete your registration: ${signupUrl}`;

        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
        const auth = btoa(`${accountSid}:${authToken}`);

        const response = await fetch(twilioUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                To: phone_number,
                From: twilioPhone,
                Body: message
            })
        });

        if (!response.ok) {
            const error = await response.text();
            await base44.asServiceRole.entities.MessageLog.create({
              message_type: 'sms',
              recipient_type: user_type === 'client' ? 'client' : 'media_partner',
              recipient_phone: phone_number,
              message_content: message,
              status: 'failed',
              error_message: error
            });
            throw new Error(`Twilio API error: ${error}`);
        }

        await base44.asServiceRole.entities.MessageLog.create({
          message_type: 'sms',
          recipient_type: user_type === 'client' ? 'client' : 'media_partner',
          recipient_phone: phone_number,
          message_content: message,
          status: 'success'
        });

        return Response.json({ 
            success: true,
            message: 'SMS invitation sent successfully',
            signup_url: signupUrl
        });
    } catch (error) {
        console.error('Error sending SMS:', error);
        return Response.json({ 
            error: error.message || 'Failed to send SMS invitation' 
        }, { status: 500 });
    }
});