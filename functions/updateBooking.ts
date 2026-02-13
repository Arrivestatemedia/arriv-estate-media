import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const { bookingId, updates } = await req.json();

        const booking = await base44.asServiceRole.entities.Booking.get(bookingId);
        if (!booking) {
            return Response.json({ error: 'Booking not found' }, { status: 404 });
        }

        const updatedBooking = await base44.asServiceRole.entities.Booking.update(bookingId, updates);

        // Send approval email to client
        const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
        const adminEmail = 'BradCBurke@arrivestatemedia.com';
        
        const propertyAddress = `${updatedBooking.street_address}, ${updatedBooking.city}, ${updatedBooking.state}`;
        const emailBody = `Hi ${updatedBooking.client_name},\n\nYour booking request has been approved and updated.\n\nProperty: ${propertyAddress}\nDate: ${updatedBooking.preferred_date}\nTime: ${updatedBooking.preferred_time}\n\nThank you,\nArriv Team`;
        const emailSubject = 'Booking Approved - Arriv';

        const messageLines = [
            `To: ${updatedBooking.client_email}`,
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

        return Response.json({ success: true, booking: updatedBooking });
    } catch (error) {
        console.error('Update booking error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});