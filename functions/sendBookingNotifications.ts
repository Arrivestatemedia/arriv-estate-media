import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { booking, type = 'confirmation', phoneNumbers = [] } = await req.json();
        
        // Send SMS via Twilio to all provided phone numbers
        const phonesToNotify = phoneNumbers.length > 0 ? phoneNumbers : (booking.client_phone ? [booking.client_phone] : []);
        
        if (phonesToNotify.length > 0) {
            const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
            const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
            const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
            
            const messageText = type === 'cancellation'
                ? `Hi ${booking.client_name}! Your booking at ${booking.property_address} on ${booking.preferred_date} at ${booking.preferred_time} has been cancelled. - Arriv`
                : `Hi ${booking.client_name}! Your booking at ${booking.property_address} on ${booking.preferred_date} at ${booking.preferred_time} has been confirmed. You'll also receive a calendar invite via email. - Arriv`;
            
            // Send SMS to each phone number
            for (const phone of phonesToNotify) {
                try {
                    const response = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Messages.json', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'Authorization': 'Basic ' + btoa(accountSid + ':' + authToken),
                        },
                        body: new URLSearchParams({
                            'From': twilioPhone,
                            'To': phone,
                            'Body': messageText,
                        }).toString(),
                    });
                } catch (error) {
                    console.error('SMS send error for ' + phone, error);
                }
            }
            
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
        
        // Send email confirmation via Gmail
        const adminEmail = 'BradCBurke@arrivestatemedia.com';
        const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');

        const emailSubject = type === 'cancellation' ? 'Your Booking Has Been Cancelled - Arriv' : 'Your Booking Confirmation - Arriv';
        const emailBody = type === 'cancellation'
            ? `Hi ${booking.client_name},\n\nYour booking has been cancelled.\n\nProperty: ${booking.property_address}\nDate: ${booking.preferred_date}\nTime: ${booking.preferred_time}\n\nIf you have any questions, please contact us.\n\nThank you,\nArriv Team`
            : `Hi ${booking.client_name},\n\nYour booking has been confirmed!\n\nProperty: ${booking.property_address}\nDate: ${booking.preferred_date}\nTime: ${booking.preferred_time}\nPackage: ${booking.package}\n\nYou should receive a calendar invite shortly. We'll contact you if there are any changes.\n\nThank you,\nArriv Team`;

        const messageLines = [
            `To: ${booking.client_email}`,
            `From: ${adminEmail}`,
            `Subject: ${emailSubject}`,
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset="UTF-8"',
            '',
            emailBody
        ];

        const messageParts = messageLines.map(line => new TextEncoder().encode(line + '\r\n'));
        const messageBytes = messageParts.reduce((acc, part) => {
            const newAcc = new Uint8Array(acc.length + part.length);
            newAcc.set(acc);
            newAcc.set(part, acc.length);
            return newAcc;
        }, new Uint8Array());

        const base64urlMessage = btoa(String.fromCharCode(...messageBytes))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');

        await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ raw: base64urlMessage })
        });

        return Response.json({ success: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});