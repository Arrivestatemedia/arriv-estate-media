import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { booking } = await req.json();
        
        // Send SMS via Twilio
        if (booking.client_phone) {
            const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
            const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
            const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
            
            const message = `Hi ${booking.client_name}! Your booking at ${booking.property_address} on ${booking.preferred_date} at ${booking.preferred_time} has been confirmed. You'll also receive a calendar invite via email. - Arriv`;
            
            const twilioResponse = await fetch(
                `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: new URLSearchParams({
                        To: booking.client_phone,
                        From: twilioPhone,
                        Body: message
                    })
                }
            );
            
            if (!twilioResponse.ok) {
                const error = await twilioResponse.text();
                console.error('Twilio error:', error);
            }
        }
        
        // Send email confirmation
        await base44.integrations.Core.SendEmail({
            to: booking.client_email,
            subject: 'Booking Confirmation - Arriv',
            body: `Hi ${booking.client_name},\n\nYour booking has been confirmed!\n\nProperty: ${booking.property_address}\nDate: ${booking.preferred_date}\nTime: ${booking.preferred_time}\nPackage: ${booking.package}\n\nYou should receive a calendar invite shortly. We'll contact you if there are any changes.\n\nThank you,\nArriv Team`
        });

        return Response.json({ success: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});