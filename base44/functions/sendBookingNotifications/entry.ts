import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { sendBrevoEmail, BOOKINGS_SENDER_EMAIL } from '../../shared/brevoClient.ts';

export default async function(req) {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { booking, type = 'confirmation', phoneNumbers = [], sendEmail = true } = await req.json().catch(() => ({}));
        if (!booking) return Response.json({ error: 'Booking data is required' }, { status: 400 });
        
        // Construct property address from separate fields
        const propertyAddress = `${booking.street_address}, ${booking.city}, ${booking.state}`;
        
        // Send SMS via Twilio to all provided phone numbers
        const phonesToNotify = phoneNumbers.length > 0 ? phoneNumbers : (booking.client_phone ? [booking.client_phone] : []);
        
        if (phonesToNotify.length > 0) {
            const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
            const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
            const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
            
            const messageText = type === 'cancellation'
                ? `Hi ${booking.client_name}! Your booking at ${propertyAddress} on ${booking.preferred_date} at ${booking.preferred_time} has been cancelled. - Arriv`
                : `Hi ${booking.client_name}! Your booking at ${propertyAddress} on ${booking.preferred_date} at ${booking.preferred_time} has been confirmed. You'll also receive a calendar invite via email. - Arriv`;
            
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
                     await base44.asServiceRole.entities.MessageLog.create({
                       message_type: 'sms',
                       recipient_type: 'client',
                       recipient_phone: phone,
                       message_content: messageText,
                       status: 'success'
                     });
                 } catch (error) {
                     console.error('SMS send error for ' + phone, error);
                     await base44.asServiceRole.entities.MessageLog.create({
                       message_type: 'sms',
                       recipient_type: 'client',
                       recipient_phone: phone,
                       message_content: messageText,
                       status: 'failed',
                       error_message: error.message
                     });
                 }
             }

        }
        
        if (sendEmail) {
            // Booking notifications use Brevo only, never the shared Gmail mailbox.

            const emailSubject = type === 'cancellation' ? 'Your Booking Has Been Cancelled - Arriv' : 'Your Booking Confirmation - Arriv';
            const emailBody = type === 'cancellation'
                ? `Hi ${booking.client_name},\n\nYour booking has been cancelled.\n\nProperty: ${propertyAddress}\nDate: ${booking.preferred_date}\nTime: ${booking.preferred_time}\n\nIf you have any questions, please contact us.\n\nThank you,\nArriv Team`
                : `Hi ${booking.client_name},\n\nYour booking has been confirmed!\n\nProperty: ${propertyAddress}\nDate: ${booking.preferred_date}\nTime: ${booking.preferred_time}\nPackage: ${booking.package}\n\nYou should receive a calendar invite shortly. We'll contact you if there are any changes.\n\nThank you,\nArriv Team`;

            const emailResponse = await sendBrevoEmail({
                to: booking.client_email,
                subject: emailSubject,
                textContent: emailBody,
                senderEmail: BOOKINGS_SENDER_EMAIL,
            });
            
            await base44.asServiceRole.entities.MessageLog.create({
              message_type: 'email',
              recipient_type: 'client',
              recipient_email: booking.client_email,
              message_content: emailBody,
              subject: emailSubject,
              status: emailResponse.ok ? 'success' : 'failed'
            });
        }

        return Response.json({ success: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}