import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { bookingId, changeRequest } = await req.json();

        // Fetch the original booking
        const booking = await base44.entities.Booking.get(bookingId);
        if (!booking) {
            return Response.json({ error: 'Booking not found' }, { status: 404 });
        }

        // Create a change request record
        const changeRequestRecord = await base44.asServiceRole.entities.BookingChangeRequest.create({
            booking_id: bookingId,
            client_email: booking.client_email,
            client_name: booking.client_name,
            original_date: booking.preferred_date,
            original_time: booking.preferred_time,
            requested_date: changeRequest.preferred_date,
            requested_time: changeRequest.preferred_time,
            is_cancellation: changeRequest.is_cancellation || false,
            notes: changeRequest.notes || '',
            status: 'pending'
        });

        // Send admin email
        const adminEmail = 'BradCBurke@arrivestatemedia.com';
        const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');

        const propertyAddress = `${booking.street_address}, ${booking.city}, ${booking.state}`;
        const changeType = changeRequest.is_cancellation ? 'CANCELLATION REQUEST' : 'CHANGE REQUEST';
        
        const emailBody = changeRequest.is_cancellation
            ? `A client has requested to CANCEL their booking.\n\nClient: ${booking.client_name}\nEmail: ${booking.client_email}\nProperty: ${propertyAddress}\nOriginal Date: ${booking.preferred_date}\nOriginal Time: ${booking.preferred_time}\n\nPlease review and respond to the client.`
            : `A client has requested to CHANGE their booking.\n\nClient: ${booking.client_name}\nEmail: ${booking.client_email}\nProperty: ${propertyAddress}\n\nOriginal Date: ${booking.preferred_date}\nOriginal Time: ${booking.preferred_time}\n\nRequested Date: ${changeRequest.preferred_date}\nRequested Time: ${changeRequest.preferred_time}\n\nNotes: ${changeRequest.notes || 'None'}\n\nPlease review and respond to the client.`;

        const emailSubject = `${changeType} - ${booking.client_name}`;

        const messageLines = [
            `To: ${adminEmail}`,
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

        const emailResponse = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ raw: base64urlMessage })
        });

        // Log the email
        await base44.asServiceRole.entities.MessageLog.create({
            message_type: 'email',
            recipient_type: 'admin',
            recipient_email: adminEmail,
            message_content: emailBody,
            subject: emailSubject,
            status: emailResponse.ok ? 'success' : 'failed'
        });

        // Send client confirmation email
        const clientEmailSubject = changeRequest.is_cancellation 
            ? 'Cancellation Request Received - Arriv' 
            : 'Change Request Received - Arriv';
        
        const clientEmailBody = `Hi ${booking.client_name},\n\nWe've received your ${changeRequest.is_cancellation ? 'cancellation' : 'change'} request. Our team will review it and get back to you shortly.\n\nThank you,\nArriv Team`;

        const clientMessageLines = [
            `To: ${booking.client_email}`,
            `From: ${adminEmail}`,
            `Subject: ${clientEmailSubject}`,
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset="UTF-8"',
            '',
            clientEmailBody
        ];

        const clientMessageParts = clientMessageLines.map(line => new TextEncoder().encode(line + '\r\n'));
        const clientMessageBytes = clientMessageParts.reduce((acc, part) => {
            const newAcc = new Uint8Array(acc.length + part.length);
            newAcc.set(acc);
            newAcc.set(part, acc.length);
            return newAcc;
        }, new Uint8Array());

        const clientBase64urlMessage = btoa(String.fromCharCode(...clientMessageBytes))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');

        const clientEmailResponse = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ raw: clientBase64urlMessage })
        });

        // Log the client email
        await base44.asServiceRole.entities.MessageLog.create({
            message_type: 'email',
            recipient_type: 'client',
            recipient_email: booking.client_email,
            message_content: clientEmailBody,
            subject: clientEmailSubject,
            status: clientEmailResponse.ok ? 'success' : 'failed'
        });

        return Response.json({ success: true, changeRequestId: changeRequestRecord.id });
    } catch (error) {
        console.error('Change request error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});